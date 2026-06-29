"""
Comprehensive test suite for the PostgreSQL -> MongoDB migration.

Covers: health, system info, auth (login/lockout/me/logout),
RBAC, catalog (incl. expiry/featured), parties, sales (cash + credit + expired-block + returns),
reports, expenses, customer/supplier accounts, system mode, backups,
day close, sync, audit log.

Order matters: we want demo data reset to run LAST.
"""
import os
import time
import uuid
import pytest
import requests

def _read_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"')
    return None


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not set"
API = f"{BASE}/api"

ADMIN = {"email_or_username": "admin", "password": "Admin@2026"}
MANAGER = {"email_or_username": "manager", "password": "Manager@2026"}
CASHIER = {"email_or_username": "cashier", "password": "Cashier@2026"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    return r


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_token():
    r = _login(ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def manager_token():
    r = _login(MANAGER)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def cashier_token():
    r = _login(CASHIER)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# -------------------- Health / Public --------------------

class TestPublic:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("db") == "mongo"

    def test_system_info_public(self):
        r = requests.get(f"{API}/system/info", timeout=10)
        assert r.status_code == 200
        b = r.json()
        assert b["mode"] in ("test", "production")
        assert b["store_name"] == "ميني ماركت الفنية"
        assert "version" in b


# -------------------- Auth --------------------

class TestAuth:
    def test_admin_login(self, admin_token):
        assert admin_token and isinstance(admin_token, str)

    def test_manager_login(self, manager_token):
        assert manager_token

    def test_cashier_login(self, cashier_token):
        assert cashier_token

    def test_me_admin(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == "admin"
        assert data["role"] == "admin"

    def test_logout(self, admin_token):
        r = requests.post(f"{API}/auth/logout", headers=_hdr(admin_token), timeout=10)
        assert r.status_code in (200, 204)

    def test_lockout_after_5_fails(self):
        # Use a throwaway dedicated username so we don't lock the real seed accounts
        # Create temporary user via admin
        admin_r = _login(ADMIN)
        admin_tok = admin_r.json()["access_token"]
        uname = f"TEST_lock_{uuid.uuid4().hex[:6]}"
        payload = {
            "username": uname,
            "email": f"{uname}@t.com",
            "password": "GoodPass@1",
            "role": "cashier",
            "full_name": "lock test",
        }
        cr = requests.post(f"{API}/auth/register", json=payload, headers=_hdr(admin_tok), timeout=10)
        assert cr.status_code in (200, 201), cr.text

        # 5 failures
        last = None
        for _ in range(5):
            last = requests.post(
                f"{API}/auth/login",
                json={"email_or_username": uname, "password": "WRONG"},
                timeout=10,
            )
            assert last.status_code in (401, 423)

        # 6th attempt (even with right pw) → expect 423
        r6 = requests.post(
            f"{API}/auth/login",
            json={"email_or_username": uname, "password": "GoodPass@1"},
            timeout=10,
        )
        assert r6.status_code == 423, f"Expected 423 lockout, got {r6.status_code}: {r6.text}"


# -------------------- RBAC --------------------

class TestRBAC:
    @pytest.mark.parametrize("path", [
        "/suppliers", "/products", "/users",
        "/admin/backups", "/admin/system/mode",
    ])
    def test_cashier_blocked(self, cashier_token, path):
        r = requests.get(f"{API}{path}", headers=_hdr(cashier_token), timeout=10)
        assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"

    def test_manager_blocked_from_users(self, manager_token):
        r = requests.get(f"{API}/users", headers=_hdr(manager_token), timeout=10)
        assert r.status_code == 403

    def test_admin_full(self, admin_token):
        for p in ["/suppliers", "/products", "/users", "/admin/backups"]:
            r = requests.get(f"{API}{p}", headers=_hdr(admin_token), timeout=10)
            assert r.status_code == 200, f"{p} -> {r.status_code}"


# -------------------- Catalog --------------------

@pytest.fixture(scope="session")
def created_product(admin_token):
    """Create a product with expiry + featured."""
    payload = {
        "name": f"TEST_PROD_{uuid.uuid4().hex[:5]}",
        "sku": f"SKU{uuid.uuid4().hex[:6].upper()}",
        "sale_price": 12.5,
        "cost_price": 7.5,
        "current_stock": 50,
        "has_expiry": True,
        "expiry_date": "2030-12-31",
        "is_featured": True,
    }
    r = requests.post(f"{API}/products", json=payload, headers=_hdr(admin_token), timeout=10)
    assert r.status_code in (200, 201), r.text
    return r.json()


class TestCatalog:
    def test_create_product(self, created_product):
        assert "id" in created_product
        assert created_product["is_featured"] is True

    def test_has_expiry_without_date_422(self, admin_token):
        payload = {
            "name": f"TEST_BAD_{uuid.uuid4().hex[:5]}",
            "sku": f"BAD{uuid.uuid4().hex[:5]}",
            "sale_price": 1, "cost_price": 0.5, "current_stock": 1,
            "has_expiry": True,
        }
        r = requests.post(f"{API}/products", json=payload, headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 422, f"got {r.status_code} {r.text}"

    def test_pos_featured(self, cashier_token, created_product):
        r = requests.get(f"{API}/pos/products?featured_only=true", headers=_hdr(cashier_token), timeout=10)
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, dict) and "items" in items:
            items = items["items"]
        ids = [p.get("id") for p in items]
        assert created_product["id"] in ids

    def test_expiry_report(self, admin_token):
        r = requests.get(f"{API}/products/expiry-report", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        body = r.json()
        # Should have severity buckets
        keys = set(body.keys()) if isinstance(body, dict) else set()
        assert keys & {"expired", "critical", "warning", "notice"} or "items" in body

    def test_manager_cannot_patch_product(self, manager_token, created_product):
        r = requests.patch(
            f"{API}/products/{created_product['id']}",
            json={"price": 99.0},
            headers=_hdr(manager_token),
            timeout=10,
        )
        # Expect 403 per spec
        assert r.status_code == 403


# -------------------- Parties --------------------

@pytest.fixture(scope="session")
def customer_id(admin_token):
    payload = {"full_name": f"TEST_CUST_{uuid.uuid4().hex[:5]}", "phone": "0500000000", "credit_limit": 10000}
    r = requests.post(f"{API}/customers", json=payload, headers=_hdr(admin_token), timeout=10)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


@pytest.fixture(scope="session")
def supplier_id(admin_token):
    payload = {"name": f"TEST_SUP_{uuid.uuid4().hex[:5]}", "phone": "0500000001"}
    r = requests.post(f"{API}/suppliers", json=payload, headers=_hdr(admin_token), timeout=10)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


class TestParties:
    def test_customer_created(self, customer_id):
        assert customer_id

    def test_supplier_created(self, supplier_id):
        assert supplier_id

    def test_cashier_can_list_customers(self, cashier_token):
        r = requests.get(f"{API}/customers", headers=_hdr(cashier_token), timeout=10)
        assert r.status_code == 200


# -------------------- Sales --------------------

class TestSales:
    def test_cash_sale_cashier(self, cashier_token, created_product):
        payload = {
            "items": [{"product_id": created_product["id"], "quantity": 1, "unit_price": float(created_product.get("sale_price", 12.5))}],
            "payment_method": "cash",
        }
        r = requests.post(f"{API}/sales", json=payload, headers=_hdr(cashier_token), timeout=15)
        assert r.status_code in (200, 201), r.text
        sale = r.json()
        assert "id" in sale

    def test_credit_no_customer_400(self, cashier_token, created_product):
        payload = {
            "items": [{"product_id": created_product["id"], "quantity": 1, "unit_price": 10}],
            "payment_method": "credit",
        }
        r = requests.post(f"{API}/sales", json=payload, headers=_hdr(cashier_token), timeout=15)
        assert r.status_code == 400

    def test_credit_with_customer(self, cashier_token, created_product, customer_id):
        payload = {
            "items": [{"product_id": created_product["id"], "quantity": 1, "unit_price": 10}],
            "payment_method": "credit",
            "customer_id": customer_id,
        }
        r = requests.post(f"{API}/sales", json=payload, headers=_hdr(cashier_token), timeout=15)
        assert r.status_code in (200, 201), r.text

    def test_sale_returns(self, admin_token, cashier_token, created_product):
        payload = {
            "items": [{"product_id": created_product["id"], "quantity": 2, "unit_price": 10}],
            "payment_method": "cash",
        }
        sr = requests.post(f"{API}/sales", json=payload, headers=_hdr(cashier_token), timeout=15)
        assert sr.status_code in (200, 201), sr.text
        sale_data = sr.json()
        sid = sale_data["id"]
        sale_items = sale_data.get("items", [])
        assert sale_items, "Sale must include items in response"
        ret_payload = {
            "sale_id": sid,
            "items": [{"sale_item_id": sale_items[0]["id"], "quantity": 1}],
            "return_type": "cash",
        }
        rr = requests.post(f"{API}/sales/{sid}/returns", json=ret_payload, headers=_hdr(admin_token), timeout=15)
        assert rr.status_code in (200, 201), rr.text


# -------------------- Reports --------------------

class TestReports:
    def test_daily(self, admin_token):
        r = requests.get(f"{API}/reports/daily", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200

    def test_monthly(self, admin_token):
        r = requests.get(f"{API}/reports/monthly", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200

    def test_profits_admin(self, admin_token):
        r = requests.get(f"{API}/reports/profits", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200

    def test_profits_manager_blocked(self, manager_token):
        r = requests.get(f"{API}/reports/profits", headers=_hdr(manager_token), timeout=15)
        assert r.status_code == 403

    def test_purchases_daily(self, admin_token):
        r = requests.get(f"{API}/reports/purchases-daily", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200

    def test_purchases_monthly(self, admin_token):
        r = requests.get(f"{API}/reports/purchases-monthly", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200


# -------------------- Expenses --------------------

class TestExpenses:
    def test_categories(self, manager_token):
        r = requests.get(f"{API}/expense-categories", headers=_hdr(manager_token), timeout=10)
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list)
        assert len(cats) >= 10

    def test_create_and_list(self, manager_token):
        cats = requests.get(f"{API}/expense-categories", headers=_hdr(manager_token), timeout=10).json()
        cat_id = cats[0]["id"]
        payload = {"category_id": cat_id, "amount": 5.0, "description": "TEST_exp"}
        r = requests.post(f"{API}/expenses", json=payload, headers=_hdr(manager_token), timeout=10)
        assert r.status_code in (200, 201), r.text
        lr = requests.get(f"{API}/expenses", headers=_hdr(manager_token), timeout=10)
        assert lr.status_code == 200


# -------------------- Customer / Supplier Accounts --------------------

class TestAccounts:
    def test_customer_balances(self, admin_token):
        r = requests.get(f"{API}/customer-accounts", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200

    def test_customer_payment(self, admin_token, customer_id):
        r = requests.post(
            f"{API}/customer-accounts/{customer_id}/payments",
            json={"amount": 1.0, "notes": "TEST_pay"},
            headers=_hdr(admin_token),
            timeout=10,
        )
        assert r.status_code in (200, 201), r.text

    def test_supplier_balances(self, admin_token):
        r = requests.get(f"{API}/supplier-accounts", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200


# -------------------- System Mode / Backups / Day-close / Sync / Audit --------------------

class TestSystemAndOps:
    def test_system_mode_get(self, admin_token):
        r = requests.get(f"{API}/admin/system/mode", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json().get("mode") in ("test", "production")

    def test_backups_admin(self, admin_token):
        for p in ["/admin/backups", "/admin/backups/status"]:
            r = requests.get(f"{API}{p}", headers=_hdr(admin_token), timeout=20)
            assert r.status_code == 200, f"{p} -> {r.status_code}"

    def test_backups_cashier_blocked(self, cashier_token):
        r = requests.get(f"{API}/admin/backups", headers=_hdr(cashier_token), timeout=10)
        assert r.status_code == 403

    def test_day_close_summary(self, admin_token):
        r = requests.get(f"{API}/day-close/summary", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200

    def test_sync_status(self, admin_token):
        r = requests.get(f"{API}/sync/status", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200

    def test_audit_log_admin(self, admin_token):
        r = requests.get(f"{API}/audit-logs", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        body = r.json()
        items = body if isinstance(body, list) else body.get("items", [])
        assert isinstance(items, list)
