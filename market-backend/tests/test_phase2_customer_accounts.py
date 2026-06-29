"""Phase 2 backend tests: customer detail, statement, payment vouchers."""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={
        "email_or_username": "admin@market.com", "password": "Admin@2026"
    })
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def test_customer(admin_headers):
    """Create dedicated customer for Phase 2 write tests."""
    suffix = datetime.now(timezone.utc).strftime("%H%M%S%f")[:9]
    payload = {
        "full_name": f"TEST_P2_Cust_{suffix}",
        "phone": f"7{suffix}"[:10],
        "credit_limit": 1000,
    }
    r = requests.post(f"{API}/customers", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="session")
def test_product(admin_headers):
    suffix = datetime.now(timezone.utc).strftime("%H%M%S%f")[:9]
    payload = {
        "sku": f"TESTP2-{suffix}", "name": f"TEST_P2_Prod_{suffix}",
        "unit_price": 10.0, "cost_price": 5.0, "stock_quantity": 100,
    }
    r = requests.post(f"{API}/products", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="session")
def credit_sale(admin_headers, test_customer, test_product):
    """Create a credit sale of 30 ر.ي for the test customer."""
    payload = {
        "items": [{"product_id": test_product["id"], "quantity": 3, "unit_price": 10}],
        "payment_method": "credit",
        "customer_id": test_customer["id"],
        "paid_amount": 0,
    }
    r = requests.post(f"{API}/sales", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ---------------- GET customer detail ----------------
class TestCustomerDetail:
    def test_404_for_unknown(self, admin_headers):
        r = requests.get(f"{API}/customers/00000000-0000-0000-0000-000000000000",
                         headers=admin_headers)
        assert r.status_code == 404

    def test_detail_returns_computed_stats(self, admin_headers, test_customer, credit_sale):
        r = requests.get(f"{API}/customers/{test_customer['id']}", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        # Identity fields
        assert d["id"] == test_customer["id"]
        assert d["full_name"] == test_customer["full_name"]
        # Computed stats present
        for k in ["total_credit_purchases", "total_paid", "total_returns",
                  "invoice_count", "payment_count", "last_activity_at"]:
            assert k in d
        # After 1 credit sale
        assert float(d["total_credit_purchases"]) >= 30
        assert int(d["invoice_count"]) >= 1
        assert float(d["balance"]) >= 30


# ---------------- Statement ----------------
class TestStatement:
    def test_statement_404_unknown(self, admin_headers):
        r = requests.get(f"{API}/customers/00000000-0000-0000-0000-000000000000/statement",
                         headers=admin_headers)
        assert r.status_code == 404

    def test_statement_shape(self, admin_headers, test_customer, credit_sale):
        r = requests.get(f"{API}/customers/{test_customer['id']}/statement",
                         headers=admin_headers)
        assert r.status_code == 200, r.text
        s = r.json()
        for k in ["customer", "opening_balance", "closing_balance",
                  "current_balance", "entries", "period", "generated_at"]:
            assert k in s
        assert s["customer"]["id"] == test_customer["id"]
        assert isinstance(s["entries"], list)
        assert len(s["entries"]) >= 1
        e = s["entries"][0]
        for k in ["date", "op_no", "type", "description", "debit", "credit",
                  "ref_id", "voided", "balance"]:
            assert k in e, f"Missing key {k} in entry"
        # Running balance after one 30-credit sale (no prior data) should match closing
        assert s["closing_balance"] >= 30

    def test_statement_entries_sorted_by_date(self, admin_headers, test_customer, credit_sale):
        r = requests.get(f"{API}/customers/{test_customer['id']}/statement",
                         headers=admin_headers)
        ents = r.json()["entries"]
        dates = [e["date"] for e in ents]
        assert dates == sorted(dates)

    def test_statement_date_filter_opening_balance(self, admin_headers, test_customer, credit_sale):
        # Future date_from should make opening_balance reflect prior totals
        future = "2099-01-01T00:00:00"
        r = requests.get(f"{API}/customers/{test_customer['id']}/statement",
                         params={"date_from": future}, headers=admin_headers)
        assert r.status_code == 200
        s = r.json()
        # All transactions are before 2099 => opening should equal current balance
        assert s["opening_balance"] >= 30
        # No entries in window
        assert s["entries"] == []


# ---------------- Payments ----------------
class TestPayments:
    def test_create_payment_reduces_balance(self, admin_headers, test_customer, credit_sale):
        # Get balance before
        before = requests.get(f"{API}/customers/{test_customer['id']}",
                              headers=admin_headers).json()
        bal_before = float(before["balance"])

        r = requests.post(f"{API}/customers/{test_customer['id']}/payments",
                          json={"amount": 5, "payment_method": "cash",
                                "notes": "TEST_P2 partial"},
                          headers=admin_headers)
        assert r.status_code == 201, r.text
        v = r.json()
        # Receipt number format REC-YYYYMMDD-NNNNN
        assert v["receipt_no"].startswith("REC-")
        parts = v["receipt_no"].split("-")
        assert len(parts) == 3 and len(parts[1]) == 8 and len(parts[2]) == 5
        assert float(v["amount"]) == 5.0
        assert v["payment_method"] == "cash"
        assert v["customer_id"] == test_customer["id"]
        # Balance reduced
        after = requests.get(f"{API}/customers/{test_customer['id']}",
                             headers=admin_headers).json()
        assert float(after["balance"]) == pytest.approx(bal_before - 5, abs=0.01)

    def test_payment_rejects_zero_or_negative(self, admin_headers, test_customer):
        r = requests.post(f"{API}/customers/{test_customer['id']}/payments",
                          json={"amount": 0, "payment_method": "cash"},
                          headers=admin_headers)
        assert r.status_code in (400, 422)

    def test_list_customer_payments(self, admin_headers, test_customer, credit_sale):
        # ensure at least one
        requests.post(f"{API}/customers/{test_customer['id']}/payments",
                      json={"amount": 1, "payment_method": "cash", "notes": "TEST_P2 list"},
                      headers=admin_headers)
        r = requests.get(f"{API}/customers/{test_customer['id']}/payments",
                         headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        p = rows[0]
        for k in ["id", "receipt_no", "amount", "payment_method",
                  "created_by_name", "created_at"]:
            assert k in p

    def test_get_single_payment_for_print(self, admin_headers, test_customer, credit_sale):
        c = requests.post(f"{API}/customers/{test_customer['id']}/payments",
                          json={"amount": 2, "payment_method": "jaib", "notes": "TEST_P2 single"},
                          headers=admin_headers).json()
        r = requests.get(f"{API}/customer-payments/{c['id']}", headers=admin_headers)
        assert r.status_code == 200
        v = r.json()
        assert v["id"] == c["id"]
        assert v["receipt_no"] == c["receipt_no"]
        assert v["customer_name"] == test_customer["full_name"]


# ---------------- Sale detail for row click ----------------
class TestSaleDetail:
    def test_sale_detail(self, admin_headers, test_customer, credit_sale):
        r = requests.get(
            f"{API}/customers/{test_customer['id']}/sales/{credit_sale['id']}/detail",
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == credit_sale["id"]
        assert d["invoice_no"] == credit_sale["invoice_no"]
        assert "items" in d and len(d["items"]) >= 1
        it = d["items"][0]
        for k in ["product_id", "product_name", "quantity", "unit_price", "total"]:
            assert k in it
        assert "cashier_name" in d

    def test_sale_detail_404(self, admin_headers, test_customer):
        r = requests.get(
            f"{API}/customers/{test_customer['id']}/sales/00000000-0000-0000-0000-000000000000/detail",
            headers=admin_headers,
        )
        assert r.status_code == 404


# ---------------- Statement reflects new payment ----------------
class TestStatementIntegration:
    def test_payment_appears_in_statement_with_running_balance(
        self, admin_headers, test_customer, credit_sale
    ):
        # Record fresh payment
        v = requests.post(f"{API}/customers/{test_customer['id']}/payments",
                          json={"amount": 3, "payment_method": "cash",
                                "notes": "TEST_P2 integration"},
                          headers=admin_headers).json()
        r = requests.get(f"{API}/customers/{test_customer['id']}/statement",
                         headers=admin_headers)
        s = r.json()
        receipt_nos = [e["op_no"] for e in s["entries"] if e["type"] == "payment"]
        assert v["receipt_no"] in receipt_nos
        # Closing balance equals current customer balance
        cur = requests.get(f"{API}/customers/{test_customer['id']}",
                           headers=admin_headers).json()
        assert s["closing_balance"] == pytest.approx(float(cur["balance"]), abs=0.01)
