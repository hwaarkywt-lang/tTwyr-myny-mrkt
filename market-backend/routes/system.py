"""System administration endpoints — MongoDB version."""
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, EmailStr

from database import get_db, C
from models import new_id
from utils.deps import require_admin
from utils.security import hash_password, verify_password
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["system"])

# Backup script lookup (works on both Emergent host and Docker container)
BACKUP_SCRIPT = Path(os.environ.get("BACKUP_SCRIPT",
                                   "/app/scripts/backup_db.sh"
                                   if Path("/app/scripts/backup_db.sh").exists()
                                   else "/app/backend/scripts/backup_db.sh"))
SYSTEM_MODE_KEY = "system_mode"
DEFAULT_MODE = "test"
VALID_MODES = {"test", "production"}

# Mongo collections that hold business / transactional data wiped on reset.
BUSINESS_COLLECTIONS = [
    C.sale_payments, C.sale_return_items, C.sale_returns, C.sale_items, C.sales,
    C.purchase_items, C.purchases,
    C.supplier_return_items, C.supplier_returns,
    C.customer_payments, C.supplier_payments,
    C.stock_audit_items, C.stock_audits, C.inventory_movements,
    C.product_change_requests, C.expenses,
    C.shifts, C.day_closes,
    C.product_batches, C.barcodes, C.products, C.categories,
    C.customers, C.suppliers,
    C.notifications, C.audit_logs, C.sync_queue, C.devices,
]


def _get_mode(db) -> str:
    s = db[C.settings].find_one({"key": SYSTEM_MODE_KEY})
    if not s or not s.get("value"):
        return DEFAULT_MODE
    v = s["value"]
    val = v.get("mode") if isinstance(v, dict) else v
    return val if val in VALID_MODES else DEFAULT_MODE


def _set_mode(db, mode: str) -> None:
    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail="Invalid mode")
    now = datetime.now(timezone.utc)
    db[C.settings].update_one(
        {"key": SYSTEM_MODE_KEY},
        {"$set": {"value": {"mode": mode}, "description": "test | production", "updated_at": now},
         "$setOnInsert": {"_id": new_id(), "key": SYSTEM_MODE_KEY, "created_at": now}},
        upsert=True,
    )


def _run_backup() -> str:
    """Run a Mongo backup script. Returns the filename on success."""
    if not BACKUP_SCRIPT.exists():
        # If no backup script available (e.g. minimal Emergent prod), return empty (non-fatal).
        return ""
    os.chmod(BACKUP_SCRIPT, 0o755)
    result = subprocess.run(
        ["/bin/bash", str(BACKUP_SCRIPT)],
        capture_output=True, text=True, timeout=180,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500,
                            detail=f"فشل النسخ الاحتياطي قبل المسح: {result.stderr[:300]}")
    backup_dir = Path(os.environ.get("BACKUP_DIR", "/app/backups"))
    if not backup_dir.exists():
        return ""
    files = sorted(list(backup_dir.glob("market_db_*.sql.gz")) +
                   list(backup_dir.glob("market_db_*.archive.gz")), reverse=True)
    return files[0].name if files else ""


def _wipe_business_data(db) -> None:
    for col in BUSINESS_COLLECTIONS:
        db[col].delete_many({})


# ─── Public ───
@router.get("/system/info")
def public_system_info(db = Depends(get_db)):
    return {
        "mode": _get_mode(db),
        "store_name": os.environ.get("STORE_NAME", "ميني ماركت الفنية"),
        "version": "1.0.0",
    }


# ─── Admin: mode ───
@router.get("/admin/system/mode")
def get_mode(db = Depends(get_db), _u = Depends(require_admin)):
    return {"mode": _get_mode(db)}


class ModeUpdate(BaseModel):
    mode: str = Field(..., description="test | production")


@router.patch("/admin/system/mode")
def set_mode_endpoint(payload: ModeUpdate, request: Request,
                      db = Depends(get_db), current = Depends(require_admin)):
    if payload.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail="Mode must be 'test' or 'production'")
    before = _get_mode(db)
    _set_mode(db, payload.mode)
    log_action(db, current["_id"], "system_mode_changed", "settings", None,
               before={"mode": before}, after={"mode": payload.mode}, request=request)
    return {"mode": payload.mode}


# ─── Admin: reset demo data ───
class ResetConfirm(BaseModel):
    confirm: str = Field(..., description="must equal 'DELETE_ALL_DEMO_DATA'")


@router.post("/admin/system/reset-demo-data")
def reset_demo_data(payload: ResetConfirm, request: Request,
                    db = Depends(get_db), current = Depends(require_admin)):
    if payload.confirm != "DELETE_ALL_DEMO_DATA":
        raise HTTPException(status_code=400, detail="عبارة التأكيد غير صحيحة")
    backup_name = _run_backup()
    try:
        _wipe_business_data(db)
        log_action(db, current["_id"], "demo_data_wiped", "system", None,
                   after={"backup": backup_name}, request=request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل مسح البيانات: {str(e)[:200]}")
    return {
        "detail": "تم مسح البيانات التجريبية بالكامل",
        "backup_created": backup_name,
        "tables_truncated": len(BUSINESS_COLLECTIONS),
    }


# ─── Admin: activate production ───
class ActivateProductionPayload(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_username: str = Field(..., min_length=3, max_length=60)
    new_email: EmailStr
    new_full_name: str = Field(..., min_length=2, max_length=120)
    new_password: str = Field(..., min_length=8)
    wipe_business_data: bool = True
    remove_demo_accounts: bool = True


@router.post("/admin/system/activate-production")
def activate_production(payload: ActivateProductionPayload, request: Request,
                        db = Depends(get_db), current = Depends(require_admin)):
    if not verify_password(payload.current_password, current["password_hash"]):
        raise HTTPException(status_code=401, detail="كلمة المرور الحالية غير صحيحة")

    backup_name = _run_backup()

    if payload.wipe_business_data:
        try:
            _wipe_business_data(db)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"فشل مسح البيانات: {str(e)[:200]}")

    if payload.remove_demo_accounts:
        demo_users = list(db[C.users].find({
            "_id": {"$ne": current["_id"]},
            "username": {"$in": ["manager", "cashier"]},
        }, {"_id": 1}))
        demo_ids = [u["_id"] for u in demo_users]
        if demo_ids:
            db[C.audit_logs].update_many({"user_id": {"$in": demo_ids}}, {"$set": {"user_id": None}})
            db[C.users].delete_many({"_id": {"$in": demo_ids}})

    new_username = payload.new_username.lower().strip()
    new_email = payload.new_email.lower().strip()
    conflict = db[C.users].find_one({
        "_id": {"$ne": current["_id"]},
        "$or": [{"username": new_username}, {"email": new_email}],
        "deleted_at": None,
    })
    if conflict:
        raise HTTPException(status_code=409, detail="اسم المستخدم أو البريد مستخدم بالفعل")

    db[C.users].update_one({"_id": current["_id"]}, {"$set": {
        "username": new_username, "email": new_email,
        "full_name": payload.new_full_name,
        "password_hash": hash_password(payload.new_password),
        "failed_login_attempts": 0, "locked_until": None,
        "updated_at": datetime.now(timezone.utc),
    }})

    _set_mode(db, "production")

    log_action(db, current["_id"], "production_activated", "system", current["_id"],
               after={"backup": backup_name, "wiped": payload.wipe_business_data,
                      "removed_demo_accounts": payload.remove_demo_accounts,
                      "new_username": new_username}, request=request)

    return {
        "detail": "تم تفعيل وضع التشغيل الحقيقي بنجاح",
        "mode": "production", "backup_created": backup_name,
        "owner_username": new_username, "owner_email": new_email,
    }
