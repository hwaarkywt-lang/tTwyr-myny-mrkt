"""Mini Market Management System - FastAPI entry point (MongoDB).

Loads .env first, configures CORS, mounts API routers, and seeds the admin user
+ default expense categories + indexes on startup.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone

from database import db, C, init_indexes
from models import UserRole, new_id
from utils.security import hash_password


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Mini Market Management System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ───────── Routers (mounted in startup-safe order) ─────────
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.catalog import router as catalog_router
from routes.parties import router as parties_router
from routes.sales import router as sales_router
from routes.expenses import router as expenses_router
from routes.reports import router as reports_router
from routes.sync import router as sync_router
from routes.notifications import router as notifications_router
from routes.customer_accounts import router as customer_accounts_router
from routes.supplier_accounts import router as supplier_accounts_router
from routes.sales_returns import router as sales_returns_router
from routes.backups import router as backups_router
from routes.audit import router as audit_router
from routes.day_close import router as day_close_router
from routes.system import router as system_router
from routes.dashboard import router as dashboard_router

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(catalog_router)
app.include_router(parties_router)
app.include_router(sales_router)
app.include_router(expenses_router)
app.include_router(reports_router)
app.include_router(sync_router)
app.include_router(notifications_router)
app.include_router(customer_accounts_router)
app.include_router(supplier_accounts_router)
app.include_router(sales_returns_router)
app.include_router(backups_router)
app.include_router(audit_router)
app.include_router(day_close_router)
app.include_router(system_router)
app.include_router(dashboard_router)


@app.get("/api/")
def root():
    return {"app": "Mini Market Management System", "status": "running", "version": "1.0.0"}


@app.get("/api/health")
def health():
    try:
        db.command("ping")
        return {"status": "ok", "db": "mongo"}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:200]}


def _seed_data():
    now = datetime.now(timezone.utc)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@market.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@2026")

    # 1. Admin (always seeded if missing)
    if not db[C.users].find_one({"email": admin_email}):
        db[C.users].insert_one({
            "_id": new_id(), "username": "admin", "email": admin_email,
            "full_name": "System Administrator",
            "password_hash": hash_password(admin_password),
            "role": "admin", "phone": None, "is_active": True,
            "last_login_at": None, "failed_login_attempts": 0, "locked_until": None,
            "created_by": None, "created_at": now, "updated_at": now, "deleted_at": None,
        })
        logger.info(f"Seeded admin user: {admin_email}")

    # 2. Demo accounts — only in test mode
    mode_setting = db[C.settings].find_one({"key": "system_mode"})
    mode = "test"
    if mode_setting and mode_setting.get("value"):
        v = mode_setting["value"]
        mode = (v.get("mode") if isinstance(v, dict) else v) or "test"

    if mode != "production":
        for username, email, role, pw, full_name in [
            ("manager", "manager@market.com", "manager", "Manager@2026", "مشرف الفرع"),
            ("cashier", "cashier@market.com", "cashier", "Cashier@2026", "كاشير"),
        ]:
            if not db[C.users].find_one({"email": email}):
                db[C.users].insert_one({
                    "_id": new_id(), "username": username, "email": email,
                    "full_name": full_name, "password_hash": hash_password(pw),
                    "role": role, "phone": None, "is_active": True,
                    "last_login_at": None, "failed_login_attempts": 0, "locked_until": None,
                    "created_by": None, "created_at": now, "updated_at": now, "deleted_at": None,
                })
    else:
        logger.info("Production mode active — skipping demo account seed")

    # 3. Default expense categories
    for name in ["مواصلات", "ماء", "شاي وقهوة", "كهرباء", "إنترنت", "نظافة",
                 "إيجار", "رواتب", "صيانة", "أخرى"]:
        if not db[C.expense_categories].find_one({"name": name}):
            db[C.expense_categories].insert_one({
                "_id": new_id(), "name": name, "is_active": True,
                "created_at": now, "updated_at": now,
            })
    logger.info(f"Seeding complete (mode={mode})")


@app.on_event("startup")
def on_startup():
    try:
        init_indexes()
    except Exception as e:
        logger.warning(f"index init failed (continuing): {e}")
    try:
        _seed_data()
    except Exception as e:
        logger.error(f"Seeding failed: {e}")
