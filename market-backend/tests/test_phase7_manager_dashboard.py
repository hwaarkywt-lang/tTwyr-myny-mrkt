"""Phase 7: Manager Dashboard tests - admin only with audit logging on 403."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://business-analytics-45.preview.emergentagent.com').rstrip('/')


def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email_or_username": username, "password": password},
                      timeout=20)
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login("admin", "Admin@2026")


@pytest.fixture(scope="session")
def manager_token():
    return _login("manager", "Manager@2026")


@pytest.fixture(scope="session")
def cashier_token():
    return _login("cashier", "Cashier@2026")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ============== Auth & RBAC ==============
class TestManagerDashboardRBAC:
    def test_admin_gets_200(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/manager", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, r.text

    def test_manager_gets_403(self, manager_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/manager", headers=_hdr(manager_token), timeout=20)
        assert r.status_code == 403
        body = r.json()
        assert body.get("detail") == "ليس لديك صلاحية للوصول إلى هذه الصفحة", body

    def test_cashier_gets_403(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/manager", headers=_hdr(cashier_token), timeout=20)
        assert r.status_code == 403
        body = r.json()
        assert body.get("detail") == "ليس لديك صلاحية للوصول إلى هذه الصفحة", body

    def test_unauthenticated_blocked(self):
        r = requests.get(f"{BASE_URL}/api/dashboard/manager", timeout=10)
        assert r.status_code in (401, 403)


# ============== Payload structure ==============
@pytest.fixture(scope="session")
def dash(admin_token):
    r = requests.get(f"{BASE_URL}/api/dashboard/manager", headers=_hdr(admin_token), timeout=30)
    assert r.status_code == 200
    return r.json()


class TestManagerDashboardShape:
    def test_top_level_keys(self, dash):
        for k in ["sales", "profits", "customers", "suppliers", "returns",
                  "expenses", "alerts", "chart_30d", "payment_methods",
                  "products", "cash_box", "as_of"]:
            assert k in dash, f"missing key {k}"

    def test_sales_numeric(self, dash):
        for k in ("today", "week", "month", "year"):
            assert isinstance(dash["sales"][k], (int, float))
            assert dash["sales"][k] >= 0

    def test_profits_numeric(self, dash):
        for k in ("today", "week", "month", "year"):
            assert isinstance(dash["profits"][k], (int, float))

    def test_customers_structure(self, dash):
        c = dash["customers"]
        assert "total_debt" in c and "top_debtors" in c
        assert isinstance(c["top_debtors"], list)
        assert len(c["top_debtors"]) <= 10
        for d in c["top_debtors"]:
            assert {"id", "name", "phone", "balance"} <= set(d.keys())
            assert d["balance"] > 0

    def test_suppliers_structure(self, dash):
        s = dash["suppliers"]
        assert "total_due" in s and "top_suppliers" in s
        assert isinstance(s["top_suppliers"], list)
        assert len(s["top_suppliers"]) <= 10
        for d in s["top_suppliers"]:
            assert d["balance"] > 0

    def test_returns_fields(self, dash):
        r = dash["returns"]
        for k in ("today_total", "month_total", "pending_count",
                  "approved_count", "rejected_count"):
            assert k in r
            assert isinstance(r[k], (int, float))

    def test_expenses_categories(self, dash):
        e = dash["expenses"]
        assert "today" in e and "month" in e and "total" in e
        assert isinstance(e["categories"], list)
        for c in e["categories"]:
            assert "category" in c and "total" in c
            assert c["total"] > 0

    def test_alerts_keys(self, dash):
        a = dash["alerts"]
        for k in ("over_credit_limit", "suppliers_overdue", "low_stock",
                  "out_of_stock", "expiring_soon"):
            assert k in a and isinstance(a[k], list)

    def test_chart_30d_length(self, dash):
        assert isinstance(dash["chart_30d"], list)
        assert len(dash["chart_30d"]) == 30
        for entry in dash["chart_30d"]:
            assert {"date", "sales", "expenses", "profit"} <= set(entry.keys())

    def test_payment_methods_array(self, dash):
        assert isinstance(dash["payment_methods"], list)
        for p in dash["payment_methods"]:
            assert {"method", "total", "count"} <= set(p.keys())

    def test_products_lists(self, dash):
        p = dash["products"]
        assert {"top_selling", "top_profit", "least_selling"} <= set(p.keys())
        assert len(p["top_selling"]) <= 5
        assert len(p["top_profit"]) <= 5
        assert len(p["least_selling"]) <= 5

    def test_cash_box_balance(self, dash):
        cb = dash["cash_box"]
        for k in ("current_balance", "total_received_today", "total_paid_today",
                  "sales_cash", "customer_receipts", "expenses_paid",
                  "supplier_paid", "cash_returns"):
            assert k in cb
        # current_balance = received - paid
        delta = cb["total_received_today"] - cb["total_paid_today"]
        assert abs(cb["current_balance"] - delta) < 0.01


# ============== /api/dashboard/summary RBAC for profit_month ==============
class TestDashboardSummaryProfit:
    def test_admin_sees_profit_month(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary", headers=_hdr(admin_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json().get("profit_month"), (int, float))

    def test_manager_profit_month_null(self, manager_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary", headers=_hdr(manager_token), timeout=20)
        assert r.status_code == 200
        assert r.json().get("profit_month") is None

    def test_cashier_profit_month_null(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary", headers=_hdr(cashier_token), timeout=20)
        # cashier may or may not access summary depending on dep; test it
        if r.status_code == 200:
            assert r.json().get("profit_month") is None


# ============== Audit log ==============
class TestAuditLog:
    def test_audit_log_entry_on_403(self, manager_token, admin_token):
        # Trigger 403 first
        requests.get(f"{BASE_URL}/api/dashboard/manager", headers=_hdr(manager_token), timeout=10)
        # Fetch audit logs as admin
        r = requests.get(f"{BASE_URL}/api/audit-logs?action=unauthorized_dashboard_access&limit=20",
                         headers=_hdr(admin_token), timeout=20)
        if r.status_code == 404:
            pytest.skip("audit-logs endpoint not exposed; cannot verify directly")
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data if isinstance(data, list) else data.get("items") or data.get("logs") or []
        found = any(row.get("action") == "unauthorized_dashboard_access" for row in rows)
        assert found, f"No unauthorized_dashboard_access entry in logs: {rows}"
