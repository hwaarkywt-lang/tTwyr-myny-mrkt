"""Phase 6 — Sales Returns workflow end-to-end tests."""
import os
import uuid
import pytest
import requests
from decimal import Decimal

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://business-analytics-45.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- Auth helpers ----------------
def _login(username: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login",
                      json={"email_or_username": username, "password": password},
                      timeout=20)
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok, f"No access_token in login response: {r.json()}"
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


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Seed helpers ----------------
@pytest.fixture(scope="session")
def test_product(admin_token):
    sku = f"RET-TEST-{uuid.uuid4().hex[:8]}"
    payload = {
        "sku": sku, "name": f"منتج اختبار مرتجع {sku}",
        "sale_price": 100, "cost_price": 60,
        "current_stock": 200, "unit": "piece",
        "is_active": True,
    }
    r = requests.post(f"{API}/products", json=payload, headers=H(admin_token), timeout=20)
    assert r.status_code in (200, 201), f"Product create failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def test_customer(admin_token):
    payload = {
        "full_name": f"TEST_عميل_{uuid.uuid4().hex[:6]}",
        "phone": f"77{uuid.uuid4().int % 10000000:07d}",
        "credit_limit": 1000000,
    }
    r = requests.post(f"{API}/customers", json=payload, headers=H(admin_token), timeout=20)
    assert r.status_code in (200, 201), f"Customer create failed: {r.text}"
    return r.json()


def _create_sale(token, product, qty, unit_price, payment_method="cash", customer_id=None):
    items = [{"product_id": product["id"], "quantity": qty, "unit_price": unit_price}]
    body = {"items": items, "payment_method": payment_method}
    if customer_id:
        body["customer_id"] = customer_id
    r = requests.post(f"{API}/sales", json=body, headers=H(token), timeout=20)
    assert r.status_code in (200, 201), f"Sale create failed: {r.status_code} {r.text}"
    return r.json()


# ---------------- Tests ----------------
class TestSearchSales:
    def test_search_sales_returns_completed(self, cashier_token, test_product):
        sale = _create_sale(cashier_token, test_product, 1, 100, "cash")
        r = requests.get(f"{API}/sales-returns/search-sales",
                         params={"q": sale["invoice_no"]},
                         headers=H(cashier_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert any(s["invoice_no"] == sale["invoice_no"] for s in data)

    def test_search_excludes_voided(self, admin_token, cashier_token, test_product):
        sale = _create_sale(cashier_token, test_product, 1, 100, "cash")
        # Void as admin
        r = requests.post(f"{API}/sales/{sale['id']}/void",
                          json={"reason": "TEST_void"}, headers=H(admin_token), timeout=20)
        assert r.status_code in (200, 204), f"Void failed: {r.text}"
        r = requests.get(f"{API}/sales-returns/search-sales",
                         params={"q": sale["invoice_no"]}, headers=H(cashier_token), timeout=20)
        assert r.status_code == 200
        assert not any(s["invoice_no"] == sale["invoice_no"] for s in r.json()), \
            "Voided sale must not appear in search results"


class TestReturnableItems:
    def test_returnable_items_basic(self, cashier_token, test_product):
        sale = _create_sale(cashier_token, test_product, 5, 100, "cash")
        r = requests.get(f"{API}/sales/{sale['id']}/returnable-items",
                         headers=H(cashier_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["invoice_no"] == sale["invoice_no"]
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert item["sold_quantity"] == 5
        assert item["previously_returned"] == 0
        assert item["remaining_returnable"] == 5

    def test_returnable_items_voided_400(self, admin_token, cashier_token, test_product):
        sale = _create_sale(cashier_token, test_product, 2, 100, "cash")
        requests.post(f"{API}/sales/{sale['id']}/void",
                      json={"reason": "TEST_void"}, headers=H(admin_token), timeout=20)
        r = requests.get(f"{API}/sales/{sale['id']}/returnable-items",
                         headers=H(cashier_token), timeout=20)
        assert r.status_code == 400


class TestCreateReturn:
    def test_happy_path_cash_pending_no_stock_change(self, cashier_token, admin_token, test_product):
        # Refresh product stock
        p_before = requests.get(f"{API}/products/{test_product['id']}",
                                headers=H(admin_token), timeout=20).json()
        stock_before = Decimal(str(p_before["current_stock"]))

        sale = _create_sale(cashier_token, test_product, 3, 100, "cash")
        si_id = sale["items"][0]["id"]
        body = {"sale_id": sale["id"], "reason": "منتج معيب",
                "items": [{"sale_item_id": si_id, "quantity": 2}]}
        r = requests.post(f"{API}/sales-returns", json=body,
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 201, f"{r.status_code} {r.text}"
        sr = r.json()
        assert sr["status"] == "pending"
        assert sr["return_no"] is None
        assert sr["total"] == 200.0
        assert sr["return_type"] == "cash"

        # Stock must be unchanged (sale -3, no return restore)
        p_after = requests.get(f"{API}/products/{test_product['id']}",
                               headers=H(admin_token), timeout=20).json()
        stock_after = Decimal(str(p_after["current_stock"]))
        assert stock_after == stock_before - 3, \
            f"Stock changed unexpectedly. before={stock_before}, after={stock_after}"

    def test_qty_exceeds_remaining_400(self, cashier_token, test_product):
        sale = _create_sale(cashier_token, test_product, 2, 100, "cash")
        si_id = sale["items"][0]["id"]
        body = {"sale_id": sale["id"], "reason": "خطأ في الفاتورة",
                "items": [{"sale_item_id": si_id, "quantity": 5}]}
        r = requests.post(f"{API}/sales-returns", json=body,
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 400
        assert "أكبر من المتاح" in r.text or "أكبر" in r.text

    def test_item_not_in_sale_400(self, cashier_token, test_product):
        sale = _create_sale(cashier_token, test_product, 1, 100, "cash")
        bogus_si = str(uuid.uuid4())
        body = {"sale_id": sale["id"], "reason": "خطأ في الفاتورة",
                "items": [{"sale_item_id": bogus_si, "quantity": 1}]}
        r = requests.post(f"{API}/sales-returns", json=body,
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 400
        assert "غير مباع" in r.text

    def test_duplicate_item_400(self, cashier_token, test_product):
        sale = _create_sale(cashier_token, test_product, 3, 100, "cash")
        si_id = sale["items"][0]["id"]
        body = {"sale_id": sale["id"], "reason": "تكرار",
                "items": [{"sale_item_id": si_id, "quantity": 1},
                          {"sale_item_id": si_id, "quantity": 1}]}
        r = requests.post(f"{API}/sales-returns", json=body,
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 400
        assert "تكرار" in r.text

    def test_voided_sale_400(self, cashier_token, admin_token, test_product):
        sale = _create_sale(cashier_token, test_product, 1, 100, "cash")
        si_id = sale["items"][0]["id"]
        requests.post(f"{API}/sales/{sale['id']}/void",
                      json={"reason": "TEST_void"}, headers=H(admin_token), timeout=20)
        body = {"sale_id": sale["id"], "reason": "test reason",
                "items": [{"sale_item_id": si_id, "quantity": 1}]}
        r = requests.post(f"{API}/sales-returns", json=body,
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 400
        assert "ملغاة" in r.text

    def test_cashier_blocked_from_other_cashier_sale(self, admin_token, cashier_token, test_product):
        # Admin creates a sale (so cashier_id = admin) — cashier should not be allowed to return it
        body_sale = {"items": [{"product_id": test_product["id"], "quantity": 1, "unit_price": 100}],
                     "payment_method": "cash"}
        r = requests.post(f"{API}/sales", json=body_sale, headers=H(admin_token), timeout=20)
        # Admin may or may not have access to /sales endpoint (require_cashier dep)
        if r.status_code not in (200, 201):
            pytest.skip(f"Admin cannot create sale (require_cashier): {r.status_code}")
        sale = r.json()
        si_id = sale["items"][0]["id"]
        body = {"sale_id": sale["id"], "reason": "test reason",
                "items": [{"sale_item_id": si_id, "quantity": 1}]}
        r = requests.post(f"{API}/sales-returns", json=body,
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 403
        assert "مبيعاتك" in r.text or "ليست" in r.text

    def test_reason_required_min_length(self, cashier_token, test_product):
        sale = _create_sale(cashier_token, test_product, 1, 100, "cash")
        si_id = sale["items"][0]["id"]
        # missing reason
        body = {"sale_id": sale["id"],
                "items": [{"sale_item_id": si_id, "quantity": 1}]}
        r = requests.post(f"{API}/sales-returns", json=body,
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 422
        # 2-char reason
        body["reason"] = "ab"
        r = requests.post(f"{API}/sales-returns", json=body,
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 422


class TestApprove:
    def test_approve_assigns_return_no_restores_stock_cash(self, cashier_token, admin_token, test_product):
        # Get product stock baseline
        stock0 = Decimal(str(requests.get(f"{API}/products/{test_product['id']}",
                                          headers=H(admin_token), timeout=20).json()["current_stock"]))
        sale = _create_sale(cashier_token, test_product, 4, 100, "cash")
        si_id = sale["items"][0]["id"]
        body = {"sale_id": sale["id"], "reason": "منتج معيب",
                "items": [{"sale_item_id": si_id, "quantity": 2}]}
        sr = requests.post(f"{API}/sales-returns", json=body,
                           headers=H(cashier_token), timeout=20).json()

        # Approve
        r = requests.post(f"{API}/sales-returns/{sr['id']}/approve",
                          headers=H(admin_token), timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        approved = r.json()
        assert approved["status"] == "approved"
        assert approved["return_no"] is not None
        assert approved["return_no"].startswith("RET-")
        # RET-YYYYMMDD-NNNNN: 5-digit zero-padded
        parts = approved["return_no"].split("-")
        assert len(parts) == 3
        assert len(parts[2]) == 5
        assert approved["approved_by"] is not None
        assert approved["approved_at"] is not None

        # Stock: -4 (sale) + 2 (return) = stock0 - 2
        stock1 = Decimal(str(requests.get(f"{API}/products/{test_product['id']}",
                                          headers=H(admin_token), timeout=20).json()["current_stock"]))
        assert stock1 == stock0 - 2, f"Expected {stock0-2}, got {stock1}"

        # Sale status partially_refunded
        s = requests.get(f"{API}/sales/{sale['id']}", headers=H(admin_token), timeout=20).json()
        assert s["status"] in ("partially_refunded", "refunded")

    def test_approve_credit_reduces_customer_balance(self, cashier_token, admin_token, test_product, test_customer):
        # Balance before
        cust_before = requests.get(f"{API}/customers/{test_customer['id']}",
                                   headers=H(admin_token), timeout=20).json()
        bal0 = Decimal(str(cust_before["balance"]))

        sale = _create_sale(cashier_token, test_product, 3, 100, "credit",
                            customer_id=test_customer["id"])
        # Balance increased by 300
        bal_after_sale = Decimal(str(requests.get(f"{API}/customers/{test_customer['id']}",
                                                  headers=H(admin_token), timeout=20).json()["balance"]))
        assert bal_after_sale == bal0 + 300

        si_id = sale["items"][0]["id"]
        body = {"sale_id": sale["id"], "reason": "العميل غير راضٍ",
                "items": [{"sale_item_id": si_id, "quantity": 1}]}
        sr = requests.post(f"{API}/sales-returns", json=body,
                           headers=H(cashier_token), timeout=20).json()
        assert sr["return_type"] == "credit"

        # Pending: balance unchanged
        bal_pending = Decimal(str(requests.get(f"{API}/customers/{test_customer['id']}",
                                               headers=H(admin_token), timeout=20).json()["balance"]))
        assert bal_pending == bal_after_sale

        # Statement should NOT include pending return
        st = requests.get(f"{API}/customers/{test_customer['id']}/statement",
                          headers=H(admin_token), timeout=20).json()
        assert not any(e.get("type") == "return" and e.get("op_no", "").startswith("RET-") and
                       e.get("ref_id") == sr["id"] for e in st["entries"])

        # Approve
        r = requests.post(f"{API}/sales-returns/{sr['id']}/approve",
                          headers=H(admin_token), timeout=20)
        assert r.status_code == 200, f"{r.text}"
        approved = r.json()

        bal_final = Decimal(str(requests.get(f"{API}/customers/{test_customer['id']}",
                                             headers=H(admin_token), timeout=20).json()["balance"]))
        assert bal_final == bal_after_sale - 100, f"Expected {bal_after_sale - 100}, got {bal_final}"

        # Statement now includes approved return
        st2 = requests.get(f"{API}/customers/{test_customer['id']}/statement",
                           headers=H(admin_token), timeout=20).json()
        ret_no = approved["return_no"]
        assert any(e.get("op_no") == ret_no for e in st2["entries"]), \
            "Approved return should appear in customer statement"

        # total_returns aggregate
        cd = requests.get(f"{API}/customers/{test_customer['id']}",
                          headers=H(admin_token), timeout=20).json()
        assert Decimal(str(cd["total_returns"])) >= Decimal("100")

    def test_cashier_cannot_approve(self, cashier_token, admin_token, test_product):
        sale = _create_sale(cashier_token, test_product, 1, 100, "cash")
        si_id = sale["items"][0]["id"]
        sr = requests.post(f"{API}/sales-returns",
                           json={"sale_id": sale["id"], "reason": "test reason",
                                 "items": [{"sale_item_id": si_id, "quantity": 1}]},
                           headers=H(cashier_token), timeout=20).json()
        r = requests.post(f"{API}/sales-returns/{sr['id']}/approve",
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 403

    def test_manager_cannot_approve(self, cashier_token, manager_token, test_product):
        sale = _create_sale(cashier_token, test_product, 1, 100, "cash")
        si_id = sale["items"][0]["id"]
        sr = requests.post(f"{API}/sales-returns",
                           json={"sale_id": sale["id"], "reason": "test reason",
                                 "items": [{"sale_item_id": si_id, "quantity": 1}]},
                           headers=H(cashier_token), timeout=20).json()
        r = requests.post(f"{API}/sales-returns/{sr['id']}/approve",
                          headers=H(manager_token), timeout=20)
        assert r.status_code == 403


class TestRejectAndCancel:
    def test_reject_no_changes(self, cashier_token, admin_token, test_product):
        stock0 = Decimal(str(requests.get(f"{API}/products/{test_product['id']}",
                                          headers=H(admin_token), timeout=20).json()["current_stock"]))
        sale = _create_sale(cashier_token, test_product, 2, 100, "cash")
        si_id = sale["items"][0]["id"]
        sr = requests.post(f"{API}/sales-returns",
                           json={"sale_id": sale["id"], "reason": "test reason",
                                 "items": [{"sale_item_id": si_id, "quantity": 1}]},
                           headers=H(cashier_token), timeout=20).json()
        r = requests.post(f"{API}/sales-returns/{sr['id']}/reject",
                          json={"reason": "غير صالح للإرجاع"},
                          headers=H(admin_token), timeout=20)
        assert r.status_code == 200
        rj = r.json()
        assert rj["status"] == "rejected"
        assert rj["rejection_reason"] == "غير صالح للإرجاع"
        # Stock should reflect just the sale (-2)
        stock1 = Decimal(str(requests.get(f"{API}/products/{test_product['id']}",
                                          headers=H(admin_token), timeout=20).json()["current_stock"]))
        assert stock1 == stock0 - 2

    def test_cancel_by_creator(self, cashier_token, test_product):
        sale = _create_sale(cashier_token, test_product, 1, 100, "cash")
        si_id = sale["items"][0]["id"]
        sr = requests.post(f"{API}/sales-returns",
                           json={"sale_id": sale["id"], "reason": "test reason",
                                 "items": [{"sale_item_id": si_id, "quantity": 1}]},
                           headers=H(cashier_token), timeout=20).json()
        r = requests.post(f"{API}/sales-returns/{sr['id']}/cancel",
                          headers=H(cashier_token), timeout=20)
        assert r.status_code == 200
        # Verify status
        g = requests.get(f"{API}/sales-returns/{sr['id']}",
                         headers=H(cashier_token), timeout=20).json()
        assert g["status"] == "canceled"


class TestList:
    def test_status_filter(self, admin_token):
        r = requests.get(f"{API}/sales-returns",
                         params={"status": "pending"},
                         headers=H(admin_token), timeout=20)
        assert r.status_code == 200
        for row in r.json():
            assert row["status"] == "pending"

    def test_cashier_sees_only_own(self, cashier_token, admin_token):
        r = requests.get(f"{API}/sales-returns", headers=H(cashier_token), timeout=20)
        assert r.status_code == 200
        # All rows must have created_by == cashier (we can't easily know id, but admin list ⊇ cashier list)
        cashier_rows = r.json()
        admin_rows = requests.get(f"{API}/sales-returns", headers=H(admin_token), timeout=20).json()
        cashier_ids = {row["id"] for row in cashier_rows}
        admin_ids = {row["id"] for row in admin_rows}
        # Cashier-visible rows must be a subset of admin-visible rows
        assert cashier_ids.issubset(admin_ids)
        # And cashier rows must all share same created_by
        creators = {row.get("created_by") for row in cashier_rows}
        if cashier_rows:
            assert len(creators) == 1, f"Cashier should only see their own creations, got creators={creators}"
