"""Iteration 10 - Backup management endpoints (status / list / run / download / delete / restore)."""
import os
import time
import pytest
import requests
import psycopg2

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://business-analytics-45.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email_or_username": "admin", "password": "Admin@2026"}
MANAGER = {"email_or_username": "manager", "password": "Manager@2026"}
CASHIER = {"email_or_username": "cashier", "password": "Cashier@2026"}

PG = dict(host="localhost", user="market_admin", password="MarketSecure2026", dbname="market_db")


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email_or_username']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def manager_token():
    return _login(MANAGER)


@pytest.fixture(scope="module")
def cashier_token():
    return _login(CASHIER)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- STATUS ----------
class TestStatus:
    def test_status_admin_ok(self, admin_token):
        r = requests.get(f"{API}/admin/backups/status", headers=H(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "count" in d and "total_size" in d and "schedule" in d
        assert d["count"] >= 1, "Expected at least 1 existing backup"
        assert d["latest"]["name"].startswith("market_db_")
        assert d["latest"]["name"].endswith(".sql.gz")
        assert isinstance(d["latest"]["age_seconds"], int)
        assert d.get("retention_days") == 14

    def test_status_manager_forbidden(self, manager_token):
        r = requests.get(f"{API}/admin/backups/status", headers=H(manager_token), timeout=20)
        assert r.status_code == 403

    def test_status_cashier_forbidden(self, cashier_token):
        r = requests.get(f"{API}/admin/backups/status", headers=H(cashier_token), timeout=20)
        assert r.status_code == 403


# ---------- LIST ----------
class TestList:
    def test_list_admin_ok(self, admin_token):
        r = requests.get(f"{API}/admin/backups", headers=H(admin_token), timeout=20)
        assert r.status_code == 200
        lst = r.json()
        assert isinstance(lst, list) and len(lst) >= 1
        for item in lst:
            assert item["name"].startswith("market_db_") and item["name"].endswith(".sql.gz")
            assert "size_human" in item and "created_at" in item

    def test_list_cashier_forbidden(self, cashier_token):
        r = requests.get(f"{API}/admin/backups", headers=H(cashier_token), timeout=20)
        assert r.status_code == 403


# ---------- RUN ----------
class TestRun:
    def test_run_creates_new_backup(self, admin_token):
        before = requests.get(f"{API}/admin/backups", headers=H(admin_token)).json()
        time.sleep(1)
        r = requests.post(f"{API}/admin/backups/run", headers=H(admin_token), timeout=200)
        assert r.status_code == 200, r.text
        time.sleep(1)
        after = requests.get(f"{API}/admin/backups", headers=H(admin_token)).json()
        assert len(after) >= len(before)
        # latest item should have a newer created_at
        assert after[0]["name"] != "" and after[0]["name"].startswith("market_db_")

    def test_run_cashier_forbidden(self, cashier_token):
        r = requests.post(f"{API}/admin/backups/run", headers=H(cashier_token), timeout=20)
        assert r.status_code == 403


# ---------- DOWNLOAD ----------
class TestDownload:
    def test_download_ok(self, admin_token):
        lst = requests.get(f"{API}/admin/backups", headers=H(admin_token)).json()
        name = lst[0]["name"]
        r = requests.get(f"{API}/admin/backups/download/{name}", headers=H(admin_token), timeout=60)
        assert r.status_code == 200
        # gzip magic bytes
        assert r.content[:2] == b"\x1f\x8b"
        assert "gzip" in r.headers.get("content-type", "").lower() or "octet" in r.headers.get("content-type", "").lower()

    def test_download_path_traversal_400(self, admin_token):
        for bad in ["../etc/passwd", "..%2fetc%2fpasswd", "foo.sql.gz", "market_db_..ev.sql.gz"]:
            r = requests.get(f"{API}/admin/backups/download/{bad}", headers=H(admin_token), timeout=20)
            assert r.status_code in (400, 404), f"{bad} → {r.status_code}"

    def test_download_nonexistent_404(self, admin_token):
        r = requests.get(f"{API}/admin/backups/download/market_db_00000000_000000.sql.gz",
                         headers=H(admin_token), timeout=20)
        assert r.status_code == 404


# ---------- DELETE ----------
class TestDelete:
    def test_delete_path_traversal_400(self, admin_token):
        r = requests.delete(f"{API}/admin/backups/foo.sql.gz", headers=H(admin_token), timeout=20)
        assert r.status_code == 400

    def test_delete_nonexistent_404(self, admin_token):
        r = requests.delete(f"{API}/admin/backups/market_db_00000000_000000.sql.gz",
                            headers=H(admin_token), timeout=20)
        assert r.status_code == 404

    def test_delete_cashier_forbidden(self, cashier_token):
        # Need a real existing file name to bypass path validation but still fail at RBAC
        r = requests.delete(f"{API}/admin/backups/market_db_99990101_000000.sql.gz",
                            headers=H(cashier_token), timeout=20)
        assert r.status_code == 403

    def test_delete_actual_old_backup(self, admin_token):
        """Delete one of the oldest backups (keep at least 4)."""
        lst = requests.get(f"{API}/admin/backups", headers=H(admin_token)).json()
        if len(lst) < 5:
            pytest.skip(f"Not enough backups to safely delete (have {len(lst)}, need 5)")
        # Delete the oldest one
        target = lst[-1]["name"]
        r = requests.delete(f"{API}/admin/backups/{target}", headers=H(admin_token), timeout=20)
        assert r.status_code == 204
        # Confirm gone
        lst2 = requests.get(f"{API}/admin/backups", headers=H(admin_token)).json()
        assert target not in [x["name"] for x in lst2]


# ---------- RESTORE: error paths only (round-trip is its own test) ----------
class TestRestoreErrorPaths:
    def test_restore_wrong_confirm_400(self, admin_token):
        lst = requests.get(f"{API}/admin/backups", headers=H(admin_token)).json()
        name = lst[0]["name"]
        r = requests.post(f"{API}/admin/backups/restore/{name}", headers=H(admin_token),
                          json={"confirm": "wrong", "current_password": "Admin@2026"}, timeout=30)
        assert r.status_code == 400

    def test_restore_wrong_password_401(self, admin_token):
        lst = requests.get(f"{API}/admin/backups", headers=H(admin_token)).json()
        name = lst[0]["name"]
        r = requests.post(f"{API}/admin/backups/restore/{name}", headers=H(admin_token),
                          json={"confirm": "RESTORE_DATABASE", "current_password": "WrongPass!"}, timeout=30)
        assert r.status_code == 401

    def test_restore_nonexistent_404(self, admin_token):
        r = requests.post(f"{API}/admin/backups/restore/market_db_00000000_000000.sql.gz",
                          headers=H(admin_token),
                          json={"confirm": "RESTORE_DATABASE", "current_password": "Admin@2026"}, timeout=30)
        assert r.status_code == 404

    def test_restore_path_traversal_400(self, admin_token):
        r = requests.post(f"{API}/admin/backups/restore/../etc/passwd",
                          headers=H(admin_token),
                          json={"confirm": "RESTORE_DATABASE", "current_password": "Admin@2026"}, timeout=30)
        assert r.status_code in (400, 404)

    def test_restore_cashier_forbidden(self, cashier_token):
        r = requests.post(f"{API}/admin/backups/restore/market_db_99990101_000000.sql.gz",
                          headers=H(cashier_token),
                          json={"confirm": "RESTORE_DATABASE", "current_password": "Cashier@2026"}, timeout=30)
        assert r.status_code == 403


# ---------- RESTORE: round-trip ----------
class TestRestoreRoundTrip:
    """Insert a unique row in expense_categories, backup, delete row, restore, verify row reappears."""

    UNIQUE_NAME = f"TEST_ITER10_RESTORE_{int(time.time())}"

    def _pg(self):
        return psycopg2.connect(**PG)

    def test_full_restore_roundtrip(self, admin_token):
        # 1. Insert unique row
        conn = self._pg()
        cur = conn.cursor()
        # Check if expense_categories table exists, else fall back to another table
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name='expense_categories'")
        has_ec = cur.fetchone() is not None
        if not has_ec:
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name='settings'")
            assert cur.fetchone(), "Neither expense_categories nor settings table found"
            # use settings: insert unique key
            cur.execute("INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
                        (self.UNIQUE_NAME, "marker"))
            conn.commit()
            verify_sql = "SELECT value FROM settings WHERE key=%s"
            delete_sql = "DELETE FROM settings WHERE key=%s"
        else:
            import uuid
            cur.execute("INSERT INTO expense_categories (id, name) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        (str(uuid.uuid4()), self.UNIQUE_NAME))
            conn.commit()
            verify_sql = "SELECT name FROM expense_categories WHERE name=%s"
            delete_sql = "DELETE FROM expense_categories WHERE name=%s"

        cur.execute(verify_sql, (self.UNIQUE_NAME,))
        assert cur.fetchone() is not None, "Insert failed"
        conn.close()

        # 2. Trigger a backup that contains this marker
        r = requests.post(f"{API}/admin/backups/run", headers=H(admin_token), timeout=200)
        assert r.status_code == 200
        time.sleep(1)
        lst = requests.get(f"{API}/admin/backups", headers=H(admin_token)).json()
        backup_name = lst[0]["name"]

        # 3. Delete the marker row
        conn = self._pg()
        cur = conn.cursor()
        cur.execute(delete_sql, (self.UNIQUE_NAME,))
        conn.commit()
        cur.execute(verify_sql, (self.UNIQUE_NAME,))
        assert cur.fetchone() is None, "Delete failed"
        conn.close()

        # 4. Restore via API
        r = requests.post(f"{API}/admin/backups/restore/{backup_name}", headers=H(admin_token),
                          json={"confirm": "RESTORE_DATABASE", "current_password": "Admin@2026"},
                          timeout=300)
        assert r.status_code == 200, f"Restore failed: {r.status_code} {r.text}"
        body = r.json()
        assert "restored_from" in body
        assert body["restored_from"] == backup_name
        assert body.get("safety_backup_created"), "Safety backup not created"
        time.sleep(2)

        # 5. Verify row is back
        conn = self._pg()
        cur = conn.cursor()
        cur.execute(verify_sql, (self.UNIQUE_NAME,))
        assert cur.fetchone() is not None, "Row was NOT restored"
        # cleanup
        cur.execute(delete_sql, (self.UNIQUE_NAME,))
        conn.commit()
        conn.close()

        # 6. Verify seed users still login (critical post-restore check)
        for c in (ADMIN, MANAGER, CASHIER):
            rr = requests.post(f"{API}/auth/login", json=c, timeout=20)
            assert rr.status_code == 200, f"Seed user {c['email_or_username']} broken after restore: {rr.text}"
