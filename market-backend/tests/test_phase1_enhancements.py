"""Phase 1 enhancement tests:
- New payment methods (cash, jaib, fluusak, hasib, banki, bank_transfer, credit)
- Locked paid_amount
- Credit requires customer
- RBAC: cashier products restrictions, manager hidden cost_price, admin full
- Product change-request flow (manager edits => 202; admin approves/rejects)
- Notifications
- Cashier-only-own sales and expenses filter
"""
import os
import uuid
import pytest
import requests
from datetime import date
from decimal import Decimal

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN = {"email_or_username": "admin@market.com", "password": "Admin@2026"}
MANAGER = {"email_or_username": "manager@market.com", "password": "Manager@2026"}
CASHIER = {"email_or_username": "cashier@market.com", "password": "Cashier@2026"}


def login(creds):
    return requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)


def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---- Fixtures ----
@pytest.fixture(scope="module")
def admin_token():
    r = login(ADMIN); assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def manager_token():
    r = login(MANAGER); assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def cashier_token():
    r = login(CASHIER); assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def product(admin_token):
    """Create a fresh product as admin with REAL cost_price for these tests."""
    # Get/create a category as admin
    cats = requests.get(f"{BASE_URL}/api/categories", headers=h(admin_token)).json()
    if cats:
        cat_id = cats[0]["id"]
    else:
        r = requests.post(f"{BASE_URL}/api/categories", headers=h(admin_token),
                          json={"name": f"TEST_Cat_{uuid.uuid4().hex[:6]}"})
        cat_id = r.json()["id"]
    sku = f"SKU-P1-{uuid.uuid4().hex[:6]}"
    payload = {
        "sku": sku, "name": f"TEST_P1_{sku}", "category_id": cat_id,
        "unit": "piece", "cost_price": "7.5", "sale_price": "15",
        "tax_rate": "0", "min_stock_level": 5, "current_stock": "200",
        "barcodes": [f"BC{uuid.uuid4().hex[:10]}"],
    }
    r = requests.post(f"{BASE_URL}/api/products", headers=h(admin_token), json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="module")
def customer(manager_token):
    r = requests.post(f"{BASE_URL}/api/customers", headers=h(manager_token),
                      json={"full_name": f"TEST_P1_Cust_{uuid.uuid4().hex[:6]}", "phone": "0599887766"})
    assert r.status_code in (200, 201), r.text
    return r.json()


# ---- 1. Product RBAC: cost_price visibility ----
class TestProductRBAC:
    def test_cashier_products_forbidden(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/products", headers=h(cashier_token))
        assert r.status_code == 403, r.text

    def test_cashier_pos_products_works_cost_hidden(self, cashier_token, product):
        r = requests.get(f"{BASE_URL}/api/pos/products", headers=h(cashier_token))
        assert r.status_code == 200, r.text
        match = [p for p in r.json() if p["id"] == product["id"]]
        assert match, "Product missing in pos/products"
        assert float(match[0]["cost_price"]) == 0.0

    def test_manager_products_cost_hidden(self, manager_token, product):
        r = requests.get(f"{BASE_URL}/api/products", headers=h(manager_token))
        assert r.status_code == 200
        match = [p for p in r.json() if p["id"] == product["id"]]
        assert match
        assert float(match[0]["cost_price"]) == 0.0, "Manager should see cost_price=0"

    def test_admin_products_cost_real(self, admin_token, product):
        r = requests.get(f"{BASE_URL}/api/products/{product['id']}", headers=h(admin_token))
        assert r.status_code == 200
        assert float(r.json()["cost_price"]) > 0, "Admin must see real cost_price"


# ---- 2. POS payment methods ----
class TestPOSPayments:
    @pytest.mark.parametrize("method", ["cash", "jaib", "fluusak", "hasib", "banki", "bank_transfer"])
    def test_payment_method_locks_paid_amount(self, cashier_token, product, method):
        # Send weird paid_amount, server must ignore it and set paid=total
        payload = {
            "items": [{"product_id": product["id"], "quantity": "1",
                       "unit_price": "15", "discount": "0", "tax": "0"}],
            "paid_amount": "0", "payment_method": method,
        }
        r = requests.post(f"{BASE_URL}/api/sales", headers=h(cashier_token), json=payload)
        assert r.status_code == 201, f"{method}: {r.text}"
        sale = r.json()
        assert float(sale["paid_amount"]) == 15.0, f"{method} should auto-set paid=total"
        assert sale["payment_method"] == method

    def test_credit_without_customer_returns_400(self, cashier_token, product):
        payload = {
            "items": [{"product_id": product["id"], "quantity": "1",
                       "unit_price": "15", "discount": "0", "tax": "0"}],
            "paid_amount": "0", "payment_method": "credit",
        }
        r = requests.post(f"{BASE_URL}/api/sales", headers=h(cashier_token), json=payload)
        assert r.status_code == 400, r.text

    def test_credit_with_customer_updates_balance(self, cashier_token, manager_token, product, customer):
        # Get pre balance via list (GET /api/customers/{id} not defined - returns 405)
        r_pre = requests.get(f"{BASE_URL}/api/customers?q={customer['full_name']}", headers=h(manager_token))
        pre_bal = Decimal(str([c for c in r_pre.json() if c["id"] == customer["id"]][0].get("balance") or "0"))

        payload = {
            "items": [{"product_id": product["id"], "quantity": "2",
                       "unit_price": "15", "discount": "0", "tax": "0"}],
            "paid_amount": "999",  # should be ignored
            "payment_method": "credit",
            "customer_id": customer["id"],
        }
        r = requests.post(f"{BASE_URL}/api/sales", headers=h(cashier_token), json=payload)
        assert r.status_code == 201, r.text
        sale = r.json()
        assert float(sale["paid_amount"]) == 0.0, "credit must lock paid=0"
        assert float(sale["total"]) == 30.0

        r_post = requests.get(f"{BASE_URL}/api/customers?q={customer['full_name']}", headers=h(manager_token))
        post_bal = Decimal(str([c for c in r_post.json() if c["id"] == customer["id"]][0].get("balance") or "0"))
        assert post_bal == pre_bal + Decimal("30"), f"balance {pre_bal} -> {post_bal}"

    def test_invalid_payment_method_rejected(self, cashier_token, product):
        payload = {
            "items": [{"product_id": product["id"], "quantity": "1",
                       "unit_price": "15", "discount": "0", "tax": "0"}],
            "paid_amount": "0", "payment_method": "bitcoin",
        }
        r = requests.post(f"{BASE_URL}/api/sales", headers=h(cashier_token), json=payload)
        # Schema may reject (422) or our validator returns 400
        assert r.status_code in (400, 422), r.text


# ---- 3. Sales filter for cashier ----
class TestSalesFilter:
    def test_cashier_sees_only_own_sales(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/sales", headers=h(cashier_token))
        assert r.status_code == 200
        sales = r.json()
        # Get my id
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h(cashier_token)).json()
        for s in sales:
            assert s["cashier_id"] == me["id"], f"Cashier saw foreign sale: {s['id']}"

    def test_manager_sees_all_sales(self, manager_token, cashier_token):
        # Cashier created some
        r_c = requests.get(f"{BASE_URL}/api/sales", headers=h(cashier_token)).json()
        r_m = requests.get(f"{BASE_URL}/api/sales", headers=h(manager_token)).json()
        assert len(r_m) >= len(r_c)


# ---- 4. Expenses filter for cashier ----
class TestCashierExpenses:
    def test_cashier_can_create_own_expense(self, cashier_token):
        cats = requests.get(f"{BASE_URL}/api/expense-categories", headers=h(cashier_token)).json()
        payload = {
            "amount": "12.5", "description": "TEST cashier daily expense",
            "expense_date": str(date.today()), "payment_method": "cash",
        }
        if cats:
            payload["category_id"] = cats[0]["id"]
        r = requests.post(f"{BASE_URL}/api/expenses", headers=h(cashier_token), json=payload)
        assert r.status_code in (200, 201), r.text
        TestCashierExpenses.eid = r.json()["id"]

    def test_cashier_lists_only_own_expenses(self, cashier_token, manager_token):
        # Manager creates an expense - cashier must NOT see it
        cats = requests.get(f"{BASE_URL}/api/expense-categories", headers=h(manager_token)).json()
        m_exp = requests.post(f"{BASE_URL}/api/expenses", headers=h(manager_token), json={
            "amount": "55", "description": "TEST manager expense",
            "expense_date": str(date.today()), "payment_method": "cash",
            **({"category_id": cats[0]["id"]} if cats else {}),
        })
        assert m_exp.status_code in (200, 201)
        m_eid = m_exp.json()["id"]
        r = requests.get(f"{BASE_URL}/api/expenses", headers=h(cashier_token))
        ids = [e["id"] for e in r.json()]
        assert m_eid not in ids, "Cashier saw manager's expense"


# ---- 5. Product change-request flow ----
class TestChangeRequests:
    def test_manager_edit_returns_202_and_no_change(self, manager_token, admin_token, product):
        # Capture before
        before = requests.get(f"{BASE_URL}/api/products/{product['id']}", headers=h(admin_token)).json()
        r = requests.patch(f"{BASE_URL}/api/products/{product['id']}", headers=h(manager_token),
                           json={"sale_price": "99.99", "name": before["name"] + "_X"})
        assert r.status_code == 202, f"Expected 202, got {r.status_code}: {r.text}"
        # Product unchanged
        after = requests.get(f"{BASE_URL}/api/products/{product['id']}", headers=h(admin_token)).json()
        assert float(after["sale_price"]) == float(before["sale_price"])
        assert after["name"] == before["name"]
        # Save before for approve test
        TestChangeRequests.original_name = before["name"]
        TestChangeRequests.original_price = float(before["sale_price"])

    def test_admin_sees_pending_request(self, admin_token, product):
        r = requests.get(f"{BASE_URL}/api/product-change-requests?status=pending", headers=h(admin_token))
        assert r.status_code == 200, r.text
        reqs = r.json()
        match = [c for c in reqs if c["product_id"] == product["id"] and c["request_type"] == "edit"]
        assert match, "No pending edit request for product"
        TestChangeRequests.req_id = match[0]["id"]

    def test_admin_unread_notification_count(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=h(admin_token))
        assert r.status_code == 200, r.text
        assert r.json()["count"] >= 1

    def test_admin_approve_applies_change(self, admin_token, product):
        rid = getattr(TestChangeRequests, "req_id", None)
        if not rid:
            pytest.skip("No request to approve")
        r = requests.post(f"{BASE_URL}/api/product-change-requests/{rid}/approve",
                          headers=h(admin_token))
        assert r.status_code == 200, r.text
        # Verify product updated
        after = requests.get(f"{BASE_URL}/api/products/{product['id']}", headers=h(admin_token)).json()
        assert float(after["sale_price"]) == 99.99, f"Expected price=99.99, got {after['sale_price']}"

    def test_manager_delete_returns_202_not_deleted(self, manager_token, admin_token, product):
        r = requests.delete(f"{BASE_URL}/api/products/{product['id']}", headers=h(manager_token))
        assert r.status_code == 202, f"Expected 202, got {r.status_code}: {r.text}"
        # Verify still exists
        check = requests.get(f"{BASE_URL}/api/products/{product['id']}", headers=h(admin_token))
        assert check.status_code == 200

    def test_admin_reject_request(self, admin_token, manager_token, product):
        # Get latest pending delete request
        reqs = requests.get(f"{BASE_URL}/api/product-change-requests?status=pending",
                            headers=h(admin_token)).json()
        match = [c for c in reqs if c["product_id"] == product["id"] and c["request_type"] == "delete"]
        if not match:
            pytest.skip("no delete request")
        rid = match[0]["id"]
        r = requests.post(f"{BASE_URL}/api/product-change-requests/{rid}/reject?reason=test+reject",
                          headers=h(admin_token))
        assert r.status_code == 200, r.text
        # Verify status updated
        rl = requests.get(f"{BASE_URL}/api/product-change-requests?status=rejected",
                          headers=h(admin_token)).json()
        assert any(c["id"] == rid for c in rl)

    def test_manager_forbidden_from_change_requests(self, manager_token):
        r = requests.get(f"{BASE_URL}/api/product-change-requests", headers=h(manager_token))
        assert r.status_code == 403, r.text


# ---- 6. Admin can delete product directly ----
class TestAdminDelete:
    def test_admin_can_soft_delete(self, admin_token, manager_token):
        # Create a throwaway product first
        cats = requests.get(f"{BASE_URL}/api/categories", headers=h(admin_token)).json()
        cat_id = cats[0]["id"] if cats else None
        sku = f"SKU-DEL-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/products", headers=h(admin_token), json={
            "sku": sku, "name": f"TEST_Del_{sku}", "category_id": cat_id,
            "unit": "piece", "cost_price": "1", "sale_price": "2",
            "tax_rate": "0", "min_stock_level": 1, "current_stock": "1",
            "barcodes": [f"BC{uuid.uuid4().hex[:10]}"],
        })
        assert r.status_code in (200, 201), r.text
        pid = r.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/products/{pid}", headers=h(admin_token))
        assert d.status_code == 204, d.text
        # 404 after delete
        chk = requests.get(f"{BASE_URL}/api/products/{pid}", headers=h(admin_token))
        assert chk.status_code == 404
