"""Iteration 9 — Production hardening + bug-fix verification.

Covers:
  • RBAC fix on /api/suppliers (cashier 403)
  • DB schema (products columns)
  • Backend expiry-mandatory validation
  • POS sale block when has_expiry=true and expiry_date=null
  • Public /api/system/info
  • Admin /api/admin/system/mode (GET, PATCH)
  • Admin /api/admin/system/reset-demo-data (destructive — runs LAST)
  • Admin /api/admin/system/activate-production (PERMANENT — runs LAST)
  • Account lockout (5 fails → 423)
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://business-analytics-45.preview.emergentagent.com").rstrip("/")

ADMIN = {"email_or_username": "admin", "password": "Admin@2026"}
MANAGER = {"email_or_username": "manager", "password": "Manager@2026"}
CASHIER = {"email_or_username": "cashier", "password": "Cashier@2026"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    t = _login(ADMIN)
    if not t:
        pytest.skip("admin login failed")
    return t


@pytest.fixture(scope="session")
def manager_token():
    t = _login(MANAGER)
    if not t:
        pytest.skip("manager login failed")
    return t


@pytest.fixture(scope="session")
def cashier_token():
    t = _login(CASHIER)
    if not t:
        pytest.skip("cashier login failed")
    return t


# ============================================================
# BUG FIX #1 — RBAC on /api/suppliers
# ============================================================
class TestSuppliersRBAC:
    def test_cashier_blocked(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/suppliers", headers=_headers(cashier_token), timeout=15)
        assert r.status_code == 403, f"Cashier expected 403, got {r.status_code} body={r.text[:200]}"

    def test_manager_allowed(self, manager_token):
        r = requests.get(f"{BASE_URL}/api/suppliers", headers=_headers(manager_token), timeout=15)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)

    def test_admin_allowed(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/suppliers", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200, r.text[:200]


# ============================================================
# BUG FIX #2 — DB schema (products: expiry_date, is_featured, featured_order)
# ============================================================
class TestProductsSchema:
    def test_get_products(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/products", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200, r.text[:200]

    def test_featured_only(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/pos/products?featured_only=true", headers=_headers(cashier_token), timeout=15)
        assert r.status_code == 200, r.text[:200]

    def test_expiry_report(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/products/expiry-report", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200, r.text[:200]


# ============================================================
# BUG FIX #4 — Backend expiry mandatory
# ============================================================
class TestExpiryMandatory:
    def _make_payload(self, has_expiry, expiry_date=None, suffix=""):
        sku = f"TEST_EXPM_{int(time.time())}_{suffix}_{uuid.uuid4().hex[:4]}"
        return {
            "sku": sku, "name": f"TEST {suffix}", "unit": "piece",
            "cost_price": "10", "sale_price": "15", "current_stock": "5",
            "has_expiry": has_expiry, "expiry_date": expiry_date,
        }

    def test_has_expiry_true_without_date_rejected(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/products", headers=_headers(admin_token),
                          json=self._make_payload(True, None, "noexp"), timeout=15)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        body = r.text
        assert "تاريخ الصلاحية" in body or "expiry" in body.lower(), f"missing arabic detail: {body[:200]}"

    def test_has_expiry_true_with_date_accepted(self, admin_token):
        from datetime import date, timedelta
        d = (date.today() + timedelta(days=60)).isoformat()
        r = requests.post(f"{BASE_URL}/api/products", headers=_headers(admin_token),
                          json=self._make_payload(True, d, "ok"), timeout=15)
        assert r.status_code in (200, 201), r.text[:200]

    def test_has_expiry_false_no_date_accepted(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/products", headers=_headers(admin_token),
                          json=self._make_payload(False, None, "noexp2"), timeout=15)
        assert r.status_code in (200, 201), r.text[:200]


# ============================================================
# BUG FIX #5 — POS sale block when has_expiry=true and expiry_date=null
# ============================================================
class TestPOSExpiryBlock:
    def test_sale_blocked_when_has_expiry_but_null(self, admin_token, cashier_token):
        # 1. Insert a product via direct SQL bypassing the validator
        import subprocess
        sku = f"TEST_NULL_EXP_{int(time.time())}"
        pid = str(uuid.uuid4())
        sql = (f"INSERT INTO products (id, sku, name, unit, cost_price, sale_price, tax_rate, "
               f"min_stock_level, current_stock, has_expiry, expiry_date, is_active, is_featured, "
               f"featured_order, created_at, updated_at) "
               f"VALUES ('{pid}', '{sku}', 'TEST_NULL_EXP', 'piece', 5, 10, 0, 0, 50, "
               f"true, NULL, true, false, 0, NOW(), NOW());")
        res = subprocess.run(
            ["psql", "-h", "localhost", "-U", "market_admin", "-d", "market_db", "-c", sql],
            env={**os.environ, "PGPASSWORD": "MarketSecure2026"},
            capture_output=True, text=True, timeout=10,
        )
        if res.returncode != 0:
            pytest.skip(f"direct insert failed: {res.stderr[:200]}")

        # 2. Open shift (cashier)
        r = requests.post(f"{BASE_URL}/api/shifts/open", headers=_headers(cashier_token),
                          json={"opening_cash": "100"}, timeout=15)
        if r.status_code == 400 and "مفتوحة" in r.text:
            cur = requests.get(f"{BASE_URL}/api/shifts/current", headers=_headers(cashier_token), timeout=10).json()
            shift_id = cur["id"]
        else:
            assert r.status_code == 200, r.text[:200]
            shift_id = r.json()["id"]

        # 3. Try to sell — should be blocked
        payload = {
            "shift_id": shift_id, "payment_method": "cash",
            "items": [{"product_id": pid, "quantity": 1, "unit_price": "10"}],
        }
        r = requests.post(f"{BASE_URL}/api/sales", headers=_headers(cashier_token), json=payload, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"
        assert "يفتقر إلى تاريخ صلاحية" in r.text, f"missing arabic detail: {r.text[:200]}"


# ============================================================
# NEW FEATURE #1 — Public system info
# ============================================================
class TestSystemInfo:
    def test_public_info(self):
        r = requests.get(f"{BASE_URL}/api/system/info", timeout=10)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body.get("store_name") == "ميني ماركت الفنية", body
        assert "mode" in body and body["mode"] in ("test", "production")
        assert "version" in body


# ============================================================
# NEW FEATURE #2 — Admin mode toggle
# ============================================================
class TestAdminModeToggle:
    def test_manager_forbidden(self, manager_token):
        r = requests.get(f"{BASE_URL}/api/admin/system/mode", headers=_headers(manager_token), timeout=10)
        assert r.status_code == 403, r.status_code

    def test_cashier_forbidden(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/admin/system/mode", headers=_headers(cashier_token), timeout=10)
        assert r.status_code == 403, r.status_code

    def test_admin_get_and_toggle(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/system/mode", headers=_headers(admin_token), timeout=10)
        assert r.status_code == 200, r.text[:200]
        original = r.json().get("mode")

        # Toggle to production
        r2 = requests.patch(f"{BASE_URL}/api/admin/system/mode",
                            headers=_headers(admin_token), json={"mode": "production"}, timeout=10)
        assert r2.status_code == 200, r2.text[:200]
        assert r2.json()["mode"] == "production"

        # Public info reflects
        r3 = requests.get(f"{BASE_URL}/api/system/info", timeout=10)
        assert r3.json()["mode"] == "production"

        # Toggle back to test
        r4 = requests.patch(f"{BASE_URL}/api/admin/system/mode",
                            headers=_headers(admin_token), json={"mode": "test"}, timeout=10)
        assert r4.status_code == 200
        assert r4.json()["mode"] == "test"

        # confirm
        r5 = requests.get(f"{BASE_URL}/api/system/info", timeout=10)
        assert r5.json()["mode"] == "test"


# ============================================================
# Account lockout regression — 5 failed logins → 423
# ============================================================
class TestAccountLockout:
    def test_lockout_after_5_fails(self):
        # Use a dedicated victim — create a throwaway user via direct DB to avoid blocking real seed users
        import subprocess
        uname = f"test_lockout_{int(time.time())}"
        from passlib.hash import bcrypt
        # cannot import in test env — fall back to inserting a known bcrypt hash for "Correct@2026"
        # Use the same as cashier — we'll mutate the cashier? NO, dangerous. Use a precomputed hash.
        # Easier: just hit auth 5x with bad password for a brand-new user → first error is 401 (user not found).
        # Skip if we can't seed a user; use cashier-style endpoint with random user that will give 401 not 423.
        # Better strategy: re-target an existing user but reset their counter at end.
        target = {"email_or_username": "cashier", "password": "WRONG_PW"}
        codes = []
        for _ in range(6):
            r = requests.post(f"{BASE_URL}/api/auth/login", json=target, timeout=10)
            codes.append(r.status_code)
        # Expect at least one 423 (locked) after 5 fails
        assert 423 in codes, f"expected 423 after 5 fails, got sequence={codes}"

        # Reset lockout for cashier via direct SQL so subsequent tests are unaffected
        subprocess.run(
            ["psql", "-h", "localhost", "-U", "market_admin", "-d", "market_db", "-c",
             "UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE username='cashier';"],
            env={**os.environ, "PGPASSWORD": "MarketSecure2026"}, capture_output=True, text=True, timeout=10,
        )


# ============================================================
# NEW FEATURE #3 — Reset demo data (destructive)  +  #4 activate production
# These run LAST. We mark them with a 'destructive' marker — actually we just rely on file ordering.
# ============================================================
class TestZZ_Destructive_ResetDemo:
    """Runs near end. Wipes business data, preserves users + categories."""

    def test_reset_wrong_confirm(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/admin/system/reset-demo-data",
                          headers=_headers(admin_token), json={"confirm": "nope"}, timeout=15)
        assert r.status_code == 400, r.text[:200]

    def test_reset_correct_confirm_triggers_backup(self, admin_token):
        backup_dir = Path("/app/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        before = set(p.name for p in backup_dir.glob("market_db_*.sql.gz"))

        r = requests.post(f"{BASE_URL}/api/admin/system/reset-demo-data",
                          headers=_headers(admin_token),
                          json={"confirm": "DELETE_ALL_DEMO_DATA"}, timeout=180)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert "backup_created" in body and body["backup_created"], body

        after = set(p.name for p in backup_dir.glob("market_db_*.sql.gz"))
        assert len(after) > len(before), f"no new backup file. before={before} after={after}"

        # Verify products/customers/suppliers now empty
        prod = requests.get(f"{BASE_URL}/api/products", headers=_headers(admin_token), timeout=10).json()
        cust = requests.get(f"{BASE_URL}/api/customers", headers=_headers(admin_token), timeout=10).json()
        assert prod == [], prod[:1]
        assert cust == [], cust[:1]


class TestZZZ_Destructive_ActivateProduction:
    """PERMANENT: changes admin credentials. Runs LAST. Restores at end."""

    def test_activate_wrong_password(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/admin/system/activate-production",
                          headers=_headers(admin_token),
                          json={
                              "current_password": "WRONG",
                              "new_username": "owner_test",
                              "new_email": "owner@example.com",
                              "new_full_name": "Owner Test",
                              "new_password": "Owner@Test2026",
                              "wipe_business_data": False,
                              "remove_demo_accounts": False,
                          }, timeout=30)
        assert r.status_code == 401, r.text[:200]

    def test_activate_success_then_restore(self, admin_token):
        new_user = "newowner"
        new_pw = "NewOwner@2026"
        r = requests.post(f"{BASE_URL}/api/admin/system/activate-production",
                          headers=_headers(admin_token),
                          json={
                              "current_password": "Admin@2026",
                              "new_username": new_user,
                              "new_email": "newowner@market.com",
                              "new_full_name": "New Owner",
                              "new_password": new_pw,
                              "wipe_business_data": True,
                              "remove_demo_accounts": True,
                          }, timeout=180)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body["mode"] == "production"
        assert body["owner_username"] == new_user
        assert body.get("backup_created")

        # Old admin login must fail (401)
        old = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=10)
        assert old.status_code in (401, 423), f"old admin should fail, got {old.status_code}: {old.text[:200]}"

        # New owner login must succeed
        nw = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email_or_username": new_user, "password": new_pw}, timeout=10)
        assert nw.status_code == 200, f"new owner login failed: {nw.status_code}: {nw.text[:200]}"
        new_token = nw.json()["access_token"]

        # Flip mode back to test (using NEW owner credentials)
        m = requests.patch(f"{BASE_URL}/api/admin/system/mode",
                           headers=_headers(new_token), json={"mode": "test"}, timeout=10)
        assert m.status_code == 200, m.text[:200]

        # RESTORE: reset admin row back to original via direct DB + bcrypt
        import subprocess
        restore_py = (
            "from dotenv import load_dotenv; load_dotenv('/app/backend/.env'); "
            "from utils.security import hash_password; "
            "from database import SessionLocal; "
            "from models import User; "
            "db=SessionLocal(); "
            "u=db.query(User).filter(User.role.in_(['admin'])).first(); "
            "u.password_hash=hash_password('Admin@2026'); "
            "u.username='admin'; u.email='admin@market.com'; u.full_name='System Administrator'; "
            "u.failed_login_attempts=0; u.locked_until=None; "
            "db.commit(); print('restored')"
        )
        res = subprocess.run(
            ["python", "-c", restore_py], cwd="/app/backend",
            capture_output=True, text=True, timeout=30,
        )
        assert "restored" in res.stdout, f"restore failed: {res.stderr[:300]}"

        # Verify old admin login works again
        time.sleep(1)
        ok = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=10)
        assert ok.status_code == 200, f"admin restore verify failed: {ok.status_code}: {ok.text[:200]}"

        # Restart backend so manager+cashier seed users get re-created (mode=test now)
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"],
                       capture_output=True, text=True, timeout=30)
        time.sleep(6)

        # Verify manager + cashier can login again
        for who, creds in [("manager", MANAGER), ("cashier", CASHIER)]:
            rr = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
            assert rr.status_code == 200, f"{who} login after restore failed: {rr.status_code}: {rr.text[:200]}"
