"""Phase 8 — Inline product creation from Purchase Invoice + price lock + purchases.

Validates:
- Manager can POST /api/products (first-time sale_price allowed).
- Manager PATCH sale_price -> 403 Arabic message.
- Cashier POST /api/products -> 403.
- Admin PATCH sale_price -> 200.
- POST /api/purchases with carton item normalizes unit_cost = carton_cost/pieces_per_carton,
  quantity = cartons*pieces_per_carton, supplier balance increases, stock updates.
- Manager request-price-change endpoint creates a pending change request.
"""
import os
import time
import requests
import pytest
from decimal import Decimal

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback to frontend/.env file
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                    break
    except Exception:
        pass

ADMIN = ('admin', 'Admin@2026')
MANAGER = ('manager', 'Manager@2026')
CASHIER = ('cashier', 'Cashier@2026')


def login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email_or_username": creds[0], "password": creds[1]}, timeout=20)
    assert r.status_code == 200, f"login failed for {creds[0]}: {r.status_code} {r.text}"
    tok = r.json().get('access_token')
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_s():
    return login(ADMIN)


@pytest.fixture(scope="module")
def manager_s():
    return login(MANAGER)


@pytest.fixture(scope="module")
def cashier_s():
    return login(CASHIER)


@pytest.fixture(scope="module")
def supplier_id(admin_s):
    """Create a TEST supplier so balance changes can be verified."""
    ts = int(time.time() * 1000)
    payload = {
        "name": f"TEST_Supplier_{ts}",
        "phone": f"7{ts % 100000000:08d}",
    }
    r = admin_s.post(f"{BASE_URL}/api/suppliers", json=payload)
    assert r.status_code in (200, 201), f"supplier create failed: {r.status_code} {r.text}"
    return r.json()["id"]


def _get_supplier_balance(s, sid):
    r = s.get(f"{BASE_URL}/api/suppliers/{sid}")
    assert r.status_code == 200, r.text
    return Decimal(str(r.json().get("balance", 0)))


# ---------------- Product creation tests ----------------
class TestInlineProductCreation:
    def test_manager_creates_product_with_sale_price(self, manager_s):
        ts = int(time.time() * 1000)
        bc = f"BAR-TEST-{ts}"
        payload = {
            "sku": f"BC-{bc[:20]}",
            "name": f"TEST_صلصة_{ts}",
            "category_id": None,
            "unit": "piece",
            "cost_price": "591.67",
            "sale_price": "700",
            "tax_rate": 0,
            "min_stock_level": 0,
            "current_stock": 0,
            "has_expiry": False,
            "barcodes": [bc],
        }
        r = manager_s.post(f"{BASE_URL}/api/products", json=payload)
        assert r.status_code == 201, f"manager product create failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["name"] == payload["name"]
        assert float(data["sale_price"]) == 700.0
        # SKU auto / prefix
        assert data["sku"].startswith("BC-")
        # Confirm persistence via GET
        rg = manager_s.get(f"{BASE_URL}/api/products/{data['id']}")
        assert rg.status_code == 200
        assert float(rg.json()["sale_price"]) == 700.0
        # Save for next tests
        pytest.created_product_id = data["id"]
        pytest.created_barcode = bc

    def test_manager_patch_sale_price_blocked_403(self, manager_s):
        pid = getattr(pytest, "created_product_id", None)
        if not pid:
            pytest.skip("no product created")
        r = manager_s.patch(f"{BASE_URL}/api/products/{pid}", json={"sale_price": 999})
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"
        detail = r.json().get("detail", "")
        assert "لا يمكن للمشرف تعديل الأسعار" in detail or "طلب تعديل سعر" in detail, detail
        # ensure price unchanged
        rg = manager_s.get(f"{BASE_URL}/api/products/{pid}")
        assert float(rg.json()["sale_price"]) == 700.0

    def test_admin_patch_sale_price_allowed(self, admin_s):
        pid = getattr(pytest, "created_product_id", None)
        if not pid:
            pytest.skip("no product created")
        r = admin_s.patch(f"{BASE_URL}/api/products/{pid}", json={"sale_price": 750})
        assert r.status_code == 200, f"admin patch failed: {r.status_code} {r.text}"
        assert float(r.json()["sale_price"]) == 750.0
        # revert
        admin_s.patch(f"{BASE_URL}/api/products/{pid}", json={"sale_price": 700})

    def test_cashier_create_product_403(self, cashier_s):
        ts = int(time.time() * 1000)
        bc = f"BAR-CASH-{ts}"
        payload = {
            "sku": f"BC-{bc[:20]}", "name": f"TEST_X_{ts}", "unit": "piece",
            "cost_price": 1, "sale_price": 2, "tax_rate": 0,
            "min_stock_level": 0, "current_stock": 0, "has_expiry": False,
            "barcodes": [bc],
        }
        r = cashier_s.post(f"{BASE_URL}/api/products", json=payload)
        assert r.status_code == 403, f"cashier should be blocked, got {r.status_code} {r.text}"

    def test_manager_price_change_request(self, manager_s):
        pid = getattr(pytest, "created_product_id", None)
        if not pid:
            pytest.skip("no product created")
        r = manager_s.post(
            f"{BASE_URL}/api/products/{pid}/request-price-change",
            json={"new_sale_price": 850, "reason": "زيادة تكلفة المورد"},
        )
        assert r.status_code == 202, f"price change request failed: {r.status_code} {r.text}"
        assert "request_id" in r.json()


# ---------------- Purchase flow with carton normalization ----------------
class TestPurchaseFlowWithCartonNormalization:
    def test_create_purchase_with_carton_item(self, manager_s, supplier_id):
        pid = getattr(pytest, "created_product_id", None)
        if not pid:
            pytest.skip("no product created")

        # Snapshot balance + stock
        bal_before = _get_supplier_balance(manager_s, supplier_id)
        prod_before = manager_s.get(f"{BASE_URL}/api/products/{pid}").json()
        stock_before = Decimal(str(prod_before.get("current_stock", 0)))

        payload = {
            "supplier_id": supplier_id,
            "notes": "TEST_purchase_carton",
            "paid_amount": 0,
            "payment_method": "credit",
            "items": [{
                "product_id": pid, "unit": "carton",
                "cartons": 10, "pieces_per_carton": 24, "carton_cost": 14200,
                "sale_price": 700,
            }],
        }
        r = manager_s.post(f"{BASE_URL}/api/purchases", json=payload)
        assert r.status_code == 201, f"purchase failed: {r.status_code} {r.text}"
        data = r.json()
        # Total should equal 10 * 14200 = 142000
        assert abs(float(data.get("total", 0)) - 142000.0) < 0.5, data
        items = data.get("items") or []
        assert len(items) == 1
        it = items[0]
        # unit_cost = 14200 / 24 ≈ 591.6667
        assert abs(float(it["unit_cost"]) - (14200 / 24)) < 0.01, it
        assert float(it["quantity"]) == 240.0, it
        # ref_no pattern PO-YYYYMMDD-NNNNN
        assert data.get("ref_no", "").startswith("PO-"), data

        # Verify balance increased by 142000
        bal_after = _get_supplier_balance(manager_s, supplier_id)
        assert (bal_after - bal_before) == Decimal("142000"), \
            f"balance delta {bal_after - bal_before} != 142000"

        # Verify product stock increased by 240
        prod_after = manager_s.get(f"{BASE_URL}/api/products/{pid}").json()
        stock_after = Decimal(str(prod_after.get("current_stock", 0)))
        assert (stock_after - stock_before) == Decimal("240"), \
            f"stock delta {stock_after - stock_before} != 240"

    def test_after_purchase_manager_still_blocked_on_sale_price(self, manager_s):
        pid = getattr(pytest, "created_product_id", None)
        if not pid:
            pytest.skip("no product created")
        r = manager_s.patch(f"{BASE_URL}/api/products/{pid}", json={"sale_price": 888})
        assert r.status_code == 403, f"after purchase manager should still be 403, got {r.status_code}"


# ---------------- Categories sanity for the dropdown ----------------
class TestCategoriesEndpoint:
    def test_list_categories(self, manager_s):
        r = manager_s.get(f"{BASE_URL}/api/categories")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
