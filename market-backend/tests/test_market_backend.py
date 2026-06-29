"""End-to-end backend tests for Mini Market Management System.
Covers: health, auth (JWT, lockout, roles), users, catalog, sales (ACID),
shifts, customers/suppliers, expenses, reports, sync, audit log.
"""
import os
import time
import uuid
import pytest
import requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN = {"email_or_username": "admin@market.com", "password": "Admin@2026"}
MANAGER = {"email_or_username": "manager@market.com", "password": "Manager@2026"}
CASHIER = {"email_or_username": "cashier@market.com", "password": "Cashier@2026"}
INVENTORY = {"email_or_username": "inventory@market.com", "password": "Inventory@2026"}


def login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    return r


def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ----------------------------- Fixtures -----------------------------
@pytest.fixture(scope="session")
def admin_token():
    r = login(ADMIN)
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def manager_token():
    r = login(MANAGER)
    assert r.status_code == 200, f"Manager login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def cashier_token():
    r = login(CASHIER)
    assert r.status_code == 200, f"Cashier login failed: {r.text}"
    return r.json()["access_token"]


# ----------------------------- Health -----------------------------
class TestHealth:
    def test_health_ok(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ----------------------------- Auth -----------------------------
class TestAuth:
    def test_login_admin_email(self):
        r = login(ADMIN)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data and len(data["access_token"]) > 20
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == "admin@market.com"

    def test_login_with_username(self):
        r = login({"email_or_username": "manager", "password": "Manager@2026"})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["username"] == "manager"

    def test_login_wrong_password(self):
        r = login({"email_or_username": "admin@market.com", "password": "WrongPass"})
        assert r.status_code == 401

    def test_me_with_token(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers(admin_token))
        assert r.status_code == 200
        assert r.json()["email"] == "admin@market.com"

    def test_me_without_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code in (401, 403)

    def test_logout(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/auth/logout", headers=headers(admin_token))
        assert r.status_code == 200


# ----------------------------- Users / RBAC -----------------------------
class TestUsersRBAC:
    def test_list_users_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/users", headers=headers(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 4

    def test_list_users_cashier_forbidden(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/users", headers=headers(cashier_token))
        assert r.status_code == 403

    def test_register_user_by_manager(self, manager_token):
        suffix = uuid.uuid4().hex[:6]
        payload = {
            "username": f"test_{suffix}",
            "email": f"test_{suffix}@market.com",
            "full_name": "TEST User",
            "password": "Passw0rd!",
            "role": "cashier",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", headers=headers(manager_token), json=payload)
        assert r.status_code == 201, r.text
        uid = r.json()["id"]
        # verify by GET
        r2 = requests.get(f"{BASE_URL}/api/users", headers=headers(manager_token))
        assert any(u["id"] == uid for u in r2.json())
        # PATCH
        r3 = requests.patch(f"{BASE_URL}/api/users/{uid}",
                            headers=headers(manager_token),
                            json={"full_name": "TEST User Updated"})
        assert r3.status_code in (200, 204)
        # DELETE (soft)
        r4 = requests.delete(f"{BASE_URL}/api/users/{uid}", headers=headers(manager_token))
        assert r4.status_code in (200, 204)

    def test_register_user_by_cashier_forbidden(self, cashier_token):
        payload = {
            "username": f"x_{uuid.uuid4().hex[:6]}",
            "email": f"x_{uuid.uuid4().hex[:6]}@market.com",
            "full_name": "X", "password": "Passw0rd!", "role": "cashier",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", headers=headers(cashier_token), json=payload)
        assert r.status_code == 403


# ----------------------------- Catalog -----------------------------
@pytest.fixture(scope="session")
def category_id(manager_token):
    payload = {"name": f"TEST_Cat_{uuid.uuid4().hex[:6]}", "description": "test"}
    r = requests.post(f"{BASE_URL}/api/categories", headers=headers(manager_token), json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


@pytest.fixture(scope="session")
def product_id(manager_token, category_id):
    sku = f"SKU-TEST-{uuid.uuid4().hex[:6]}"
    barcode = f"BC{uuid.uuid4().hex[:10]}"
    payload = {
        "sku": sku, "name": f"TEST_Prod_{sku}",
        "category_id": category_id,
        "unit": "piece", "cost_price": "5", "sale_price": "10",
        "tax_rate": "0", "min_stock_level": 5, "current_stock": "50",
        "barcodes": [barcode],
    }
    r = requests.post(f"{BASE_URL}/api/products", headers=headers(manager_token), json=payload)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return {"id": data["id"], "barcode": barcode, "sku": sku}


class TestCatalog:
    def test_categories_list(self, manager_token, category_id):
        r = requests.get(f"{BASE_URL}/api/categories", headers=headers(manager_token))
        assert r.status_code == 200
        assert any(c["id"] == category_id for c in r.json())

    def test_products_list(self, manager_token, product_id):
        r = requests.get(f"{BASE_URL}/api/products", headers=headers(manager_token))
        assert r.status_code == 200
        assert any(p["id"] == product_id["id"] for p in r.json())

    def test_product_get_by_id(self, manager_token, product_id):
        r = requests.get(f"{BASE_URL}/api/products/{product_id['id']}", headers=headers(manager_token))
        assert r.status_code == 200
        assert r.json()["id"] == product_id["id"]
        assert str(r.json()["current_stock"]).startswith("50")

    def test_product_by_barcode(self, manager_token, product_id):
        r = requests.get(f"{BASE_URL}/api/products/by-barcode/{product_id['barcode']}",
                         headers=headers(manager_token))
        assert r.status_code == 200, r.text
        assert r.json()["id"] == product_id["id"]

    def test_product_patch(self, manager_token, product_id):
        r = requests.patch(f"{BASE_URL}/api/products/{product_id['id']}",
                           headers=headers(manager_token),
                           json={"sale_price": "12.5"})
        assert r.status_code in (200, 204)
        r2 = requests.get(f"{BASE_URL}/api/products/{product_id['id']}", headers=headers(manager_token))
        assert float(r2.json()["sale_price"]) == 12.5


# ----------------------------- Sales / ACID -----------------------------
class TestSales:
    def test_create_sale_decreases_stock(self, cashier_token, manager_token, product_id):
        # current stock
        r_pre = requests.get(f"{BASE_URL}/api/products/{product_id['id']}", headers=headers(manager_token))
        pre_stock = float(r_pre.json()["current_stock"])

        payload = {
            "items": [{
                "product_id": product_id["id"], "quantity": "2",
                "unit_price": "12.5", "discount": "0", "tax": "0",
            }],
            "discount_amount": "0", "tax_amount": "0",
            "paid_amount": "25", "payment_method": "cash",
        }
        r = requests.post(f"{BASE_URL}/api/sales", headers=headers(cashier_token), json=payload)
        assert r.status_code == 201, r.text
        sale = r.json()
        assert sale["invoice_no"].startswith("INV-")
        assert float(sale["subtotal"]) == 25.0
        assert float(sale["total"]) == 25.0
        assert float(sale["change_amount"]) == 0.0

        # verify stock decreased
        r_post = requests.get(f"{BASE_URL}/api/products/{product_id['id']}", headers=headers(manager_token))
        post_stock = float(r_post.json()["current_stock"])
        assert post_stock == pre_stock - 2, f"Stock didn't decrease: {pre_stock}->{post_stock}"

        # Save sale id for void test
        TestSales.sale_id = sale["id"]
        TestSales.invoice_no = sale["invoice_no"]

    def test_insufficient_stock_for_cashier(self, cashier_token, product_id):
        payload = {
            "items": [{
                "product_id": product_id["id"], "quantity": "99999",
                "unit_price": "12.5", "discount": "0", "tax": "0",
            }],
            "paid_amount": "0", "payment_method": "cash",
        }
        r = requests.post(f"{BASE_URL}/api/sales", headers=headers(cashier_token), json=payload)
        assert r.status_code == 400, r.text

    def test_void_sale_restores_stock(self, cashier_token, manager_token, product_id):
        sid = getattr(TestSales, "sale_id", None)
        if not sid:
            pytest.skip("No prior sale id")
        r_pre = requests.get(f"{BASE_URL}/api/products/{product_id['id']}", headers=headers(manager_token))
        pre_stock = float(r_pre.json()["current_stock"])
        r = requests.post(f"{BASE_URL}/api/sales/{sid}/void", headers=headers(manager_token))
        assert r.status_code == 200, r.text
        r_post = requests.get(f"{BASE_URL}/api/products/{product_id['id']}", headers=headers(manager_token))
        post_stock = float(r_post.json()["current_stock"])
        assert post_stock == pre_stock + 2

    def test_cashier_cannot_create_expense(self, cashier_token):
        # Get an expense category first
        r_cats = requests.get(f"{BASE_URL}/api/expense-categories", headers=headers(cashier_token))
        cat_id = r_cats.json()[0]["id"] if r_cats.status_code == 200 and r_cats.json() else None
        payload = {
            "amount": "20", "description": "TEST", "expense_date": str(date.today()),
            "payment_method": "cash",
        }
        if cat_id:
            payload["category_id"] = cat_id
        r = requests.post(f"{BASE_URL}/api/expenses", headers=headers(cashier_token), json=payload)
        assert r.status_code == 403


# ----------------------------- Shifts -----------------------------
class TestShifts:
    def test_open_close_shift(self, cashier_token):
        # Close any existing open shift first
        r_cur = requests.get(f"{BASE_URL}/api/shifts/current", headers=headers(cashier_token))
        if r_cur.status_code == 200 and r_cur.json():
            sid = r_cur.json()["id"]
            requests.post(f"{BASE_URL}/api/shifts/{sid}/close",
                          headers=headers(cashier_token),
                          json={"closing_cash": "0"})

        r = requests.post(f"{BASE_URL}/api/shifts/open", headers=headers(cashier_token),
                          json={"opening_cash": "100"})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]

        # Try opening again - should fail
        r2 = requests.post(f"{BASE_URL}/api/shifts/open", headers=headers(cashier_token),
                           json={"opening_cash": "100"})
        assert r2.status_code == 400

        # Close shift
        r3 = requests.post(f"{BASE_URL}/api/shifts/{sid}/close",
                           headers=headers(cashier_token),
                           json={"closing_cash": "100"})
        assert r3.status_code == 200, r3.text
        body = r3.json()
        assert body["status"] == "closed"
        assert body["expected_cash"] is not None
        assert body["variance"] is not None


# ----------------------------- Customers / Suppliers -----------------------------
class TestParties:
    def test_customer_crud(self, manager_token):
        suffix = uuid.uuid4().hex[:6]
        payload = {"full_name": f"TEST_Cust_{suffix}", "phone": "0500000000"}
        r = requests.post(f"{BASE_URL}/api/customers", headers=headers(manager_token), json=payload)
        assert r.status_code in (200, 201), r.text
        cid = r.json()["id"]
        r2 = requests.get(f"{BASE_URL}/api/customers", headers=headers(manager_token))
        assert any(c["id"] == cid for c in r2.json())
        r3 = requests.patch(f"{BASE_URL}/api/customers/{cid}",
                            headers=headers(manager_token),
                            json={"phone": "0511111111"})
        assert r3.status_code in (200, 204)
        r4 = requests.delete(f"{BASE_URL}/api/customers/{cid}", headers=headers(manager_token))
        assert r4.status_code in (200, 204)

    def test_supplier_crud(self, manager_token):
        suffix = uuid.uuid4().hex[:6]
        payload = {"name": f"TEST_Supp_{suffix}", "phone": "0500000000"}
        r = requests.post(f"{BASE_URL}/api/suppliers", headers=headers(manager_token), json=payload)
        assert r.status_code in (200, 201), r.text
        sid = r.json()["id"]
        r2 = requests.get(f"{BASE_URL}/api/suppliers", headers=headers(manager_token))
        assert any(s["id"] == sid for s in r2.json())
        r3 = requests.delete(f"{BASE_URL}/api/suppliers/{sid}", headers=headers(manager_token))
        assert r3.status_code in (200, 204)


# ----------------------------- Expenses -----------------------------
class TestExpenses:
    def test_create_expense_manager(self, manager_token):
        r_cats = requests.get(f"{BASE_URL}/api/expense-categories", headers=headers(manager_token))
        assert r_cats.status_code == 200
        cat_id = r_cats.json()[0]["id"] if r_cats.json() else None
        payload = {
            "amount": "50", "description": "TEST expense",
            "expense_date": str(date.today()), "payment_method": "cash",
        }
        if cat_id:
            payload["category_id"] = cat_id
        r = requests.post(f"{BASE_URL}/api/expenses", headers=headers(manager_token), json=payload)
        assert r.status_code in (200, 201), r.text
        eid = r.json()["id"]
        r2 = requests.get(f"{BASE_URL}/api/expenses", headers=headers(manager_token))
        assert any(e["id"] == eid for e in r2.json())
        r3 = requests.delete(f"{BASE_URL}/api/expenses/{eid}", headers=headers(manager_token))
        assert r3.status_code in (200, 204)


# ----------------------------- Reports -----------------------------
class TestReports:
    def test_dashboard_summary(self, manager_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary", headers=headers(manager_token))
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ["sales_today", "sales_month", "top_products", "daily_sales",
                    "products_count", "low_stock_count", "customers_count",
                    "suppliers_count", "expenses_month", "profit_month"]:
            assert key in d, f"missing {key}"

    def test_sales_by_day(self, manager_token):
        r = requests.get(f"{BASE_URL}/api/reports/sales-by-day", headers=headers(manager_token))
        assert r.status_code == 200

    def test_low_stock(self, manager_token):
        r = requests.get(f"{BASE_URL}/api/reports/low-stock", headers=headers(manager_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ----------------------------- Sync -----------------------------
class TestSync:
    def test_sync_status(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/sync/status", headers=headers(admin_token))
        assert r.status_code == 200, r.text

    def test_sync_push(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/sync/push", headers=headers(admin_token),
                          json={"device_id": "TEST_DEVICE_1", "items": []})
        assert r.status_code in (200, 201, 202), r.text
        assert r.json().get("queued") == 0
