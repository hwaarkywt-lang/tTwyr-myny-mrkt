"""
Phase-4 Backend Tests:
- Role cleanup (inventory_clerk removed)
- 3-role RBAC (admin/manager/cashier)
- Price-change request workflow (طلب تعديل سعر)
- Approve/Reject flows
- Cashier restrictions
- Supplier / supplier-returns / supplier-statement
- Purchase invoice IMMUTABILITY
"""
import os
import uuid
import pytest
import requests
from decimal import Decimal

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback - read from frontend .env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

API = f"{BASE_URL}/api"


# -------- Auth helpers --------
def _login(username, password):
    r = requests.post(f"{API}/auth/login",
                      json={"email_or_username": username, "password": password},
                      timeout=20)
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok, f"No access_token in response: {r.text}"
    return tok


@pytest.fixture(scope="session")
def admin_token():
    return _login("admin", "Admin@2026")


@pytest.fixture(scope="session")
def manager_token():
    return _login("manager", "Manager@2026")


@pytest.fixture(scope="session")
def cashier_token():
    return _login("cashier", "Cashier@2026")


def h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ========== Auth & Role Cleanup ==========
class TestAuthAndRoleCleanup:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200

    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 10

    def test_manager_login(self, manager_token):
        assert isinstance(manager_token, str) and len(manager_token) > 10

    def test_cashier_login(self, cashier_token):
        assert isinstance(cashier_token, str) and len(cashier_token) > 10

    def test_no_inventory_clerk_users(self, admin_token):
        r = requests.get(f"{API}/users", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        users = r.json()
        bad = [u for u in users if u.get("role") == "inventory_clerk"]
        assert not bad, f"Found inventory_clerk users: {bad}"
        emails = [u.get("email") for u in users]
        assert "inventory@market.com" not in emails

    def test_only_three_roles_exist(self, admin_token):
        r = requests.get(f"{API}/users", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        roles = {u.get("role") for u in r.json()}
        assert roles.issubset({"admin", "manager", "cashier"}), f"Unexpected roles: {roles}"


# ========== Employee Management (Admin Only) ==========
class TestEmployeeManagementAdminOnly:
    def test_manager_cannot_list_users(self, manager_token):
        r = requests.get(f"{API}/users", headers=h(manager_token), timeout=15)
        assert r.status_code == 403, f"Manager should be 403, got {r.status_code} {r.text}"

    def test_cashier_cannot_list_users(self, cashier_token):
        r = requests.get(f"{API}/users", headers=h(cashier_token), timeout=15)
        assert r.status_code == 403

    def test_admin_can_list_users(self, admin_token):
        r = requests.get(f"{API}/users", headers=h(admin_token), timeout=15)
        assert r.status_code == 200

    def test_manager_cannot_register(self, manager_token):
        payload = {
            "username": f"test_{uuid.uuid4().hex[:6]}",
            "email": f"test_{uuid.uuid4().hex[:6]}@market.com",
            "full_name": "Test Cashier",
            "password": "Test@2026",
            "role": "cashier",
        }
        r = requests.post(f"{API}/auth/register", json=payload, headers=h(manager_token), timeout=15)
        assert r.status_code == 403, f"Manager register should be 403, got {r.status_code} {r.text}"

    def test_admin_can_register_cashier(self, admin_token):
        payload = {
            "username": f"TEST_cash_{uuid.uuid4().hex[:6]}",
            "email": f"TEST_cash_{uuid.uuid4().hex[:6]}@market.com",
            "full_name": "TEST Cashier",
            "password": "Test@2026",
            "role": "cashier",
        }
        r = requests.post(f"{API}/auth/register", json=payload, headers=h(admin_token), timeout=15)
        assert r.status_code in (200, 201), f"Admin register failed: {r.status_code} {r.text}"
        assert r.json().get("role") == "cashier"


# ========== Product Price-Lock for Manager ==========
@pytest.fixture(scope="module")
def admin_product(admin_token):
    """Create a test product as admin and return its dict."""
    sku = f"TEST-PRICE-{uuid.uuid4().hex[:8].upper()}"
    payload = {
        "sku": sku,
        "name": f"منتج اختبار {sku}",
        "unit": "piece",
        "cost_price": "10.00",
        "sale_price": "20.00",
        "tax_rate": "0.05",
        "min_stock_level": 5,
        "current_stock": "100",
    }
    r = requests.post(f"{API}/products", json=payload, headers=h(admin_token), timeout=15)
    assert r.status_code in (200, 201), f"Create product failed: {r.status_code} {r.text}"
    return r.json()


class TestManagerPriceLock:
    def test_manager_blocked_sale_price_patch(self, manager_token, admin_token, admin_product):
        pid = admin_product["id"]
        r = requests.patch(f"{API}/products/{pid}", json={"sale_price": "99.00"},
                           headers=h(manager_token), timeout=15)
        assert r.status_code == 403
        assert "طلب تعديل سعر" in r.json().get("detail", "") or "المشرف" in r.json().get("detail", "")
        # verify unchanged
        r2 = requests.get(f"{API}/products/{pid}", headers=h(admin_token), timeout=15)
        assert r2.status_code == 200
        assert Decimal(str(r2.json()["sale_price"])) == Decimal("20.00")

    def test_manager_blocked_cost_price_patch(self, manager_token, admin_product):
        pid = admin_product["id"]
        r = requests.patch(f"{API}/products/{pid}", json={"cost_price": "5.00"},
                           headers=h(manager_token), timeout=15)
        assert r.status_code == 403

    def test_manager_blocked_tax_rate_patch(self, manager_token, admin_product):
        pid = admin_product["id"]
        r = requests.patch(f"{API}/products/{pid}", json={"tax_rate": "0.15"},
                           headers=h(manager_token), timeout=15)
        assert r.status_code == 403

    def test_manager_nonprice_field_creates_request_202(self, manager_token, admin_token, admin_product):
        pid = admin_product["id"]
        orig_name = admin_product["name"]
        r = requests.patch(f"{API}/products/{pid}", json={"name": "اسم جديد محدث"},
                           headers=h(manager_token), timeout=15)
        # FastAPI raises HTTPException(202) which the server returns as 202
        assert r.status_code == 202, f"Expected 202, got {r.status_code} {r.text}"
        detail = r.json().get("detail", "")
        assert "للمدير" in detail or "للمراجعة" in detail
        # verify product not changed yet
        r2 = requests.get(f"{API}/products/{pid}", headers=h(admin_token), timeout=15)
        assert r2.json()["name"] == orig_name

    def test_admin_can_edit_price_directly(self, admin_token, admin_product):
        pid = admin_product["id"]
        r = requests.patch(f"{API}/products/{pid}", json={"sale_price": "30.00"},
                           headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert Decimal(str(r.json()["sale_price"])) == Decimal("30.00")


# ========== Price-Change-Request Endpoint ==========
class TestPriceChangeRequest:
    def test_missing_reason_returns_422(self, manager_token, admin_product):
        pid = admin_product["id"]
        r = requests.post(f"{API}/products/{pid}/request-price-change",
                          json={"new_sale_price": "25.00"},
                          headers=h(manager_token), timeout=15)
        assert r.status_code == 422

    def test_short_reason_returns_422(self, manager_token, admin_product):
        pid = admin_product["id"]
        r = requests.post(f"{API}/products/{pid}/request-price-change",
                          json={"new_sale_price": "25.00", "reason": "ab"},
                          headers=h(manager_token), timeout=15)
        assert r.status_code == 422

    def test_same_price_returns_400(self, manager_token, admin_token, admin_product):
        # Read CURRENT price (after admin direct edit above to 30)
        pid = admin_product["id"]
        rcur = requests.get(f"{API}/products/{pid}", headers=h(admin_token), timeout=15)
        current_price = str(rcur.json()["sale_price"])
        r = requests.post(f"{API}/products/{pid}/request-price-change",
                          json={"new_sale_price": current_price, "reason": "تحديث"},
                          headers=h(manager_token), timeout=15)
        assert r.status_code == 400, f"got {r.status_code} {r.text}"
        assert "مطابق" in r.json().get("detail", "")

    def test_success_request_created(self, manager_token, admin_token, admin_product):
        pid = admin_product["id"]
        # Get current price
        rcur = requests.get(f"{API}/products/{pid}", headers=h(admin_token), timeout=15)
        cur = Decimal(str(rcur.json()["sale_price"]))
        new_price = str(cur + Decimal("5.50"))
        r = requests.post(f"{API}/products/{pid}/request-price-change",
                          json={"new_sale_price": new_price, "reason": "تحديث سعر السوق"},
                          headers=h(manager_token), timeout=15)
        assert r.status_code == 202, f"got {r.status_code} {r.text}"
        body = r.json()
        assert "request_id" in body
        req_id = body["request_id"]

        # product price unchanged
        r2 = requests.get(f"{API}/products/{pid}", headers=h(admin_token), timeout=15)
        assert Decimal(str(r2.json()["sale_price"])) == cur

        # appears in list
        rl = requests.get(f"{API}/product-change-requests?status=pending",
                          headers=h(admin_token), timeout=15)
        assert rl.status_code == 200
        match = next((x for x in rl.json() if x["id"] == req_id), None)
        assert match is not None
        assert match["request_type"] == "price_change"
        assert match["change_reason"] == "تحديث سعر السوق"
        assert str(match["after_data"]["sale_price"]) == str(Decimal(new_price))

        # Save for next test
        pytest.last_price_request_id = req_id
        pytest.last_price_request_target = new_price
        pytest.last_product_id = pid

    def test_approve_price_change(self, admin_token):
        req_id = getattr(pytest, "last_price_request_id", None)
        assert req_id, "Previous test did not store request id"
        r = requests.post(f"{API}/product-change-requests/{req_id}/approve",
                          headers=h(admin_token), timeout=15)
        assert r.status_code == 200, f"approve: {r.status_code} {r.text}"
        # verify product sale_price changed
        pid = pytest.last_product_id
        r2 = requests.get(f"{API}/products/{pid}", headers=h(admin_token), timeout=15)
        expected = Decimal(pytest.last_price_request_target)
        assert Decimal(str(r2.json()["sale_price"])) == expected, \
            f"price not updated: got {r2.json()['sale_price']} expected {expected}"

    def test_reject_price_change(self, manager_token, admin_token, admin_product):
        pid = admin_product["id"]
        rcur = requests.get(f"{API}/products/{pid}", headers=h(admin_token), timeout=15)
        cur = Decimal(str(rcur.json()["sale_price"]))
        new_price = str(cur + Decimal("7.25"))
        r = requests.post(f"{API}/products/{pid}/request-price-change",
                          json={"new_sale_price": new_price, "reason": "اختبار رفض"},
                          headers=h(manager_token), timeout=15)
        assert r.status_code == 202
        req_id = r.json()["request_id"]

        rr = requests.post(f"{API}/product-change-requests/{req_id}/reject",
                           params={"reason": "السعر مرتفع"},
                           headers=h(admin_token), timeout=15)
        assert rr.status_code == 200

        # product unchanged
        r2 = requests.get(f"{API}/products/{pid}", headers=h(admin_token), timeout=15)
        assert Decimal(str(r2.json()["sale_price"])) == cur

        # status now rejected
        rl = requests.get(f"{API}/product-change-requests?status=rejected",
                          headers=h(admin_token), timeout=15)
        assert any(x["id"] == req_id for x in rl.json())


# ========== Cashier Restrictions ==========
class TestCashierRestrictions:
    def test_cashier_blocked_products_list(self, cashier_token):
        r = requests.get(f"{API}/products", headers=h(cashier_token), timeout=15)
        assert r.status_code == 403, f"got {r.status_code} {r.text}"

    def test_cashier_blocked_suppliers(self, cashier_token, admin_token):
        # Create a supplier first as admin to have an id
        sup_payload = {"name": f"TEST مورد {uuid.uuid4().hex[:6]}", "phone": "777000111"}
        rs = requests.post(f"{API}/suppliers", json=sup_payload, headers=h(admin_token), timeout=15)
        assert rs.status_code in (200, 201), rs.text
        sid = rs.json().get("id")
        r = requests.get(f"{API}/suppliers/{sid}", headers=h(cashier_token), timeout=15)
        assert r.status_code == 403


# ========== Supplier Accounts (Manager) ==========
@pytest.fixture(scope="module")
def supplier_and_product(admin_token, manager_token):
    # supplier (manager allowed)
    sup_payload = {"name": f"TEST تاجر {uuid.uuid4().hex[:6]}", "phone": "777111222"}
    rs = requests.post(f"{API}/suppliers", json=sup_payload, headers=h(manager_token), timeout=15)
    assert rs.status_code in (200, 201), f"supplier create: {rs.status_code} {rs.text}"
    sup = rs.json()
    # product (admin to set cost)
    sku = f"TEST-SUP-{uuid.uuid4().hex[:6].upper()}"
    pp = {"sku": sku, "name": f"بضاعة {sku}", "unit": "piece",
          "cost_price": "0", "sale_price": "30", "tax_rate": "0",
          "min_stock_level": 0, "current_stock": "0"}
    rp = requests.post(f"{API}/products", json=pp, headers=h(admin_token), timeout=15)
    assert rp.status_code in (200, 201), rp.text
    return sup, rp.json()


class TestSupplierAccountsManager:
    def test_create_purchase_carton_mode(self, manager_token, supplier_and_product):
        sup, prod = supplier_and_product
        payload = {
            "supplier_id": sup["id"],
            "items": [
                {
                    "product_id": prod["id"],
                    "quantity": "24",       # 1 carton = 24 pcs
                    "unit_cost": str(round(Decimal("14200") / Decimal("24"), 2)),  # 591.67
                }
            ],
            "paid_amount": "0",
            "notes": "TEST carton purchase",
        }
        r = requests.post(f"{API}/purchases", json=payload, headers=h(manager_token), timeout=20)
        assert r.status_code in (200, 201), f"purchase: {r.status_code} {r.text}"
        body = r.json()
        # Verify stock increment
        rg = requests.get(f"{API}/products/{prod['id']}", headers=h(manager_token), timeout=15)
        if rg.status_code == 200:
            assert Decimal(str(rg.json()["current_stock"])) >= Decimal("24")
        pytest.last_purchase_id = body.get("id")

    def test_purchase_immutable_no_patch(self, manager_token):
        pid = getattr(pytest, "last_purchase_id", None)
        if not pid:
            pytest.skip("no purchase created")
        r = requests.patch(f"{API}/purchases/{pid}", json={"notes": "x"},
                           headers=h(manager_token), timeout=15)
        assert r.status_code in (404, 405), f"expected 405/404, got {r.status_code}"

    def test_purchase_immutable_no_delete(self, manager_token):
        pid = getattr(pytest, "last_purchase_id", None)
        if not pid:
            pytest.skip("no purchase created")
        r = requests.delete(f"{API}/purchases/{pid}", headers=h(manager_token), timeout=15)
        assert r.status_code in (404, 405)

    def _get_purchase_item_id(self, manager_token, pid):
        rg = requests.get(f"{API}/purchases/{pid}", headers=h(manager_token), timeout=15)
        assert rg.status_code == 200, rg.text
        body = rg.json()
        items = body.get("items") or body.get("purchase_items") or []
        assert items, f"no items in purchase response: {body}"
        return items[0].get("id")

    def test_supplier_return_works(self, manager_token, supplier_and_product):
        sup, prod = supplier_and_product
        pid = getattr(pytest, "last_purchase_id", None)
        if not pid:
            pytest.skip("no purchase id")
        pi_id = self._get_purchase_item_id(manager_token, pid)
        payload = {
            "supplier_id": sup["id"],
            "purchase_id": pid,
            "items": [{"purchase_item_id": pi_id, "return_quantity": "2"}],
            "notes": "TEST return",
        }
        r = requests.post(f"{API}/supplier-returns", json=payload, headers=h(manager_token), timeout=20)
        assert r.status_code in (200, 201), f"return: {r.status_code} {r.text}"

    def test_supplier_return_over_qty_rejected(self, manager_token, supplier_and_product):
        sup, _ = supplier_and_product
        pid = getattr(pytest, "last_purchase_id", None)
        if not pid:
            pytest.skip("no purchase id")
        pi_id = self._get_purchase_item_id(manager_token, pid)
        payload = {
            "supplier_id": sup["id"],
            "purchase_id": pid,
            "items": [{"purchase_item_id": pi_id, "return_quantity": "9999"}],
        }
        r = requests.post(f"{API}/supplier-returns", json=payload, headers=h(manager_token), timeout=20)
        assert r.status_code == 400, f"got {r.status_code} {r.text}"

    def test_supplier_statement(self, manager_token, supplier_and_product):
        sup, _ = supplier_and_product
        r = requests.get(f"{API}/suppliers/{sup['id']}/statement",
                         headers=h(manager_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # Must contain at least entries / opening_balance keys
        assert isinstance(body, dict)
        keys = set(body.keys())
        assert keys & {"entries", "transactions", "rows", "items", "opening_balance",
                       "closing_balance", "balance"}, f"unexpected statement keys: {keys}"
