"""Iteration 13 - Verify lockout-500 fix (tz_aware=True on MongoClient)
and spot-check datetime fields on /api/sales, /api/products, /api/admin/backups/status.

Run: pytest backend/tests/test_iter13_lockout_and_tz.py -v
"""
import os
import uuid
import datetime as dt

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"

ADMIN = {"email_or_username": "admin", "password": "Admin@2026"}
MANAGER = {"email_or_username": "manager", "password": "Manager@2026"}
CASHIER = {"email_or_username": "cashier", "password": "Cashier@2026"}

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mini_market")


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=10)
    return r


@pytest.fixture(scope="module")
def admin_token():
    # Make sure admin is unlocked first
    cli = MongoClient(MONGO_URL)
    cli[DB_NAME]["users"].update_many(
        {"username": {"$in": ["admin", "manager", "cashier"]}},
        {"$set": {"failed_login_attempts": 0, "locked_until": None}},
    )
    cli.close()
    r = _login(ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# --------------------------------------------------------------------- lockout

class TestLockoutFlow:
    """End-to-end: register -> 5x401 -> 423 (NOT 500) -> manual unlock -> success."""

    def test_lockout_returns_423_not_500(self, admin_token):
        uname = f"TEST_lk13_{uuid.uuid4().hex[:6]}"
        payload = {
            "username": uname,
            "email": f"{uname}@t.com",
            "password": "GoodPass@1",
            "role": "cashier",
            "full_name": "iter13 lockout test",
        }
        cr = requests.post(
            f"{API}/auth/register", json=payload, headers=_hdr(admin_token), timeout=10
        )
        assert cr.status_code in (200, 201), cr.text

        # 5 wrong-password POSTs => 401
        for i in range(5):
            r = requests.post(
                f"{API}/auth/login",
                json={"email_or_username": uname, "password": "WRONG"},
                timeout=10,
            )
            assert r.status_code == 401, (
                f"attempt {i+1}: expected 401, got {r.status_code}: {r.text}"
            )

        # 6th POST (correct password) MUST be 423, NOT 500
        r6 = requests.post(
            f"{API}/auth/login",
            json={"email_or_username": uname, "password": "GoodPass@1"},
            timeout=10,
        )
        assert r6.status_code == 423, (
            f"Expected 423 'Account temporarily locked', got {r6.status_code}: {r6.text}"
        )
        body = r6.json()
        assert "lock" in (body.get("detail") or "").lower(), body

        # 7th POST wrong-password also 423 (same naive-vs-aware path)
        r7 = requests.post(
            f"{API}/auth/login",
            json={"email_or_username": uname, "password": "WRONG"},
            timeout=10,
        )
        assert r7.status_code == 423, (
            f"Expected 423 on locked re-attempt, got {r7.status_code}: {r7.text}"
        )

        # Unlock via mongo, verify correct password now succeeds
        cli = MongoClient(MONGO_URL)
        res = cli[DB_NAME]["users"].update_one(
            {"username": uname},
            {"$set": {"failed_login_attempts": 0, "locked_until": None}},
        )
        cli.close()
        assert res.modified_count == 1

        ok = requests.post(
            f"{API}/auth/login",
            json={"email_or_username": uname, "password": "GoodPass@1"},
            timeout=10,
        )
        assert ok.status_code == 200, (
            f"Expected 200 after unlock, got {ok.status_code}: {ok.text}"
        )
        # cleanup: delete the throwaway user
        cli = MongoClient(MONGO_URL)
        cli[DB_NAME]["users"].delete_one({"username": uname})
        cli.close()

    def test_seed_accounts_still_unlocked(self, admin_token):
        # explicit ask in the request: leave seed accounts unlocked
        for creds in (ADMIN, MANAGER, CASHIER):
            r = _login(creds)
            assert r.status_code == 200, (
                f"Seed account {creds['email_or_username']} unable to login: {r.status_code} {r.text}"
            )


# --------------------------------------------------------------------- datetime sanity

def _is_aware_iso(s):
    """ISO-8601 with timezone info (Z, +HH:MM, or -HH:MM)."""
    if not isinstance(s, str):
        return False
    try:
        d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return False
    return d.tzinfo is not None


class TestDatetimeRegressionAfterTzAware:
    """tz_aware=True on the MongoClient must not break existing datetime
    serialization. Each endpoint below was working pre-fix; verify it
    still returns parseable, tz-aware ISO strings."""

    def test_sales_created_at(self, admin_token):
        r = requests.get(f"{API}/sales", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # accept either list or {items: [...]}
        items = data if isinstance(data, list) else data.get("items") or data.get("results") or []
        if not items:
            pytest.skip("no sales in DB to assert datetime serialization")
        s = items[0]
        assert "created_at" in s, s
        assert _is_aware_iso(s["created_at"]), (
            f"sales[0].created_at not tz-aware ISO: {s['created_at']!r}"
        )

    def test_products_created_at(self, admin_token):
        r = requests.get(f"{API}/products", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else data.get("items") or data.get("results") or []
        if not items:
            pytest.skip("no products in DB")
        p = items[0]
        assert "created_at" in p, p
        assert _is_aware_iso(p["created_at"]), (
            f"products[0].created_at not tz-aware ISO: {p['created_at']!r}"
        )

    def test_backups_status_created_at(self, admin_token):
        # Endpoint per request: /api/admin/backups/status (latest.created_at)
        r = requests.get(f"{API}/admin/backups/status", headers=_hdr(admin_token), timeout=15)
        # Some builds expose only /api/admin/backups list — fall back
        if r.status_code == 404:
            r = requests.get(f"{API}/admin/backups", headers=_hdr(admin_token), timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            items = data if isinstance(data, list) else data.get("items") or []
            if not items:
                pytest.skip("no backups to assert")
            latest = items[0]
        else:
            assert r.status_code == 200, r.text
            body = r.json()
            latest = body.get("latest") or body
        ts = latest.get("created_at") if isinstance(latest, dict) else None
        if not ts:
            pytest.skip(f"backups status has no created_at field: {latest}")
        assert _is_aware_iso(ts), f"backup latest.created_at not tz-aware: {ts!r}"
