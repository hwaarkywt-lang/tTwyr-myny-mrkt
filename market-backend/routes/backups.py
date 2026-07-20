"""Backup management — automated APScheduler + manual trigger + Google Drive stub."""
import gzip
import json
import os
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from database import get_db, C
from models import new_id
from utils.deps import require_admin
from utils.audit import log_action
from utils.security import verify_password

router = APIRouter(prefix="/api/admin/backups", tags=["backups"])
logger = logging.getLogger(__name__)

# ── directories & config paths ───────────────────────────────────────────────
_DEFAULT_DIR = Path(os.environ.get("BACKUP_DIR", "")).expanduser() \
               if os.environ.get("BACKUP_DIR") else None
BACKUP_DIR   = _DEFAULT_DIR or Path(__file__).resolve().parent.parent / "data" / "backups"
SETTINGS_FILE = Path(__file__).resolve().parent.parent / "data" / "backup_settings.json"

DEFAULT_SETTINGS: dict = {
    "local_interval_hours": 2,
    "daily_midnight": True,
    "retention_count": 30,
    "drive_enabled": False,
    "drive_interval_hours": 4,
}

# ── module-level scheduler state ─────────────────────────────────────────────
_scheduler: Optional[BackgroundScheduler] = None
_last_auto_backup: Optional[str] = None
_last_auto_error: Optional[str] = None


# ── helpers ───────────────────────────────────────────────────────────────────

def _load_settings() -> dict:
    try:
        if SETTINGS_FILE.exists():
            return {**DEFAULT_SETTINGS, **json.loads(SETTINGS_FILE.read_text())}
    except Exception:
        pass
    return dict(DEFAULT_SETTINGS)


def _save_settings(settings: dict):
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(settings, ensure_ascii=False, indent=2))


def _human(n: float) -> str:
    s = float(n)
    for u in ["B", "KB", "MB", "GB"]:
        if s < 1024:
            return f"{s:.1f} {u}"
        s /= 1024
    return f"{s:.1f} TB"


def _valid_name(filename: str) -> bool:
    return (
        "/" not in filename
        and ".." not in filename
        and filename.startswith("market_db_")
        and (filename.endswith(".json.gz") or filename.endswith(".sql.gz") or filename.endswith(".archive.gz"))
    )


def _list_backups():
    BACKUP_DIR.mkdir(exist_ok=True, parents=True)
    files = (
        list(BACKUP_DIR.glob("market_db_*.json.gz"))
        + list(BACKUP_DIR.glob("market_db_*.sql.gz"))
        + list(BACKUP_DIR.glob("market_db_*.archive.gz"))
    )
    return sorted(files, key=lambda f: f.stat().st_mtime, reverse=True)


def _infer_trigger(name: str) -> str:
    if "_auto." in name:  return "auto"
    if "_daily." in name: return "daily"
    if "_safety." in name: return "safety"
    return "manual"


# ── collections to export ─────────────────────────────────────────────────────
_COLLECTIONS = [
    C.users, C.settings, C.categories, C.products, C.barcodes, C.product_batches,
    C.customers, C.suppliers,
    C.customer_accounts, C.supplier_accounts,
    C.customer_payments, C.supplier_payments,
    C.sales, C.sale_items, C.sale_payments, C.sale_returns, C.sale_return_items,
    C.purchases, C.purchase_items,
    C.supplier_returns, C.supplier_return_items,
    C.inventory_movements, C.stock_audits, C.stock_audit_items,
    C.expenses, C.expense_categories,
    C.shifts, C.notifications, C.audit_logs,
    C.devices, C.sync_queue,
    C.product_change_requests, C.day_closes,
]


def _json_default(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    try:
        from decimal import Decimal
        if isinstance(obj, Decimal):
            return float(obj)
    except ImportError:
        pass
    return str(obj)


def _do_backup(db, trigger: str = "manual") -> Path:
    """Export every collection to a gzipped JSON file and enforce retention."""
    global _last_auto_backup, _last_auto_error
    BACKUP_DIR.mkdir(exist_ok=True, parents=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filepath = BACKUP_DIR / f"market_db_{ts}_{trigger}.json.gz"

    data: dict = {}
    for col_name in _COLLECTIONS:
        try:
            rows = list(db[col_name].find())
            data[col_name] = [{k: v for k, v in r.items()} for r in rows]
        except Exception:
            data[col_name] = []

    meta = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "trigger": trigger,
        "collections": len(data),
        "total_documents": sum(len(v) for v in data.values()),
        "format_version": "1.1",
    }
    with gzip.open(str(filepath), "wt", encoding="utf-8") as fh:
        json.dump({"meta": meta, "data": data}, fh,
                  ensure_ascii=False, default=_json_default, indent=None)

    # Enforce retention
    cfg   = _load_settings()
    keep  = int(cfg.get("retention_count", 30))
    for old in _list_backups()[keep:]:
        try: old.unlink()
        except Exception: pass

    if trigger not in ("manual", "safety"):
        _last_auto_backup = datetime.now(timezone.utc).isoformat()
        _last_auto_error  = None

    logger.info("Backup created: %s (%.1f KB)", filepath.name,
                filepath.stat().st_size / 1024)
    return filepath


def _auto_backup_job(trigger: str = "auto"):
    """Scheduled job — gets its own DB reference."""
    global _last_auto_error
    try:
        from database import db as _db
        _do_backup(_db, trigger=trigger)
    except Exception as exc:
        _last_auto_error = str(exc)
        logger.error("Auto backup (%s) failed: %s", trigger, exc)


# ── Scheduler lifecycle (called from server.py) ───────────────────────────────

def _next_run(job_id: str) -> Optional[str]:
    if _scheduler is None:
        return None
    job = _scheduler.get_job(job_id)
    if job is None or job.next_run_time is None:
        return None
    return job.next_run_time.isoformat()


def start_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        return
    cfg = _load_settings()
    _scheduler = BackgroundScheduler(timezone="UTC")
    _add_jobs(cfg)
    _scheduler.start()
    logger.info("Backup scheduler started — interval=%sh midnight=%s",
                cfg.get("local_interval_hours", 2), cfg.get("daily_midnight", True))


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Backup scheduler stopped")


def _add_jobs(cfg: dict):
    assert _scheduler is not None
    interval_h = int(cfg.get("local_interval_hours", 2))
    _scheduler.add_job(
        _auto_backup_job,
        trigger=IntervalTrigger(hours=interval_h),
        id="local_interval",
        kwargs={"trigger": "auto"},
        replace_existing=True,
        misfire_grace_time=300,
    )
    if cfg.get("daily_midnight", True):
        _scheduler.add_job(
            _auto_backup_job,
            trigger=CronTrigger(hour=0, minute=0, timezone="UTC"),
            id="daily_midnight",
            kwargs={"trigger": "daily"},
            replace_existing=True,
            misfire_grace_time=600,
        )


def _reschedule(cfg: dict):
    if _scheduler is None or not _scheduler.running:
        return
    interval_h = int(cfg.get("local_interval_hours", 2))
    _scheduler.reschedule_job("local_interval",
                               trigger=IntervalTrigger(hours=interval_h))
    if cfg.get("daily_midnight", True):
        try:
            _scheduler.reschedule_job(
                "daily_midnight",
                trigger=CronTrigger(hour=0, minute=0, timezone="UTC"))
        except Exception:
            _scheduler.add_job(
                _auto_backup_job,
                trigger=CronTrigger(hour=0, minute=0, timezone="UTC"),
                id="daily_midnight",
                kwargs={"trigger": "daily"},
                replace_existing=True,
                misfire_grace_time=600,
            )
    else:
        try: _scheduler.remove_job("daily_midnight")
        except Exception: pass


# ── Settings endpoints ────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings(_u=Depends(require_admin)):
    return _load_settings()


class BackupSettingsIn(BaseModel):
    local_interval_hours: int = Field(2, ge=1, le=24)
    daily_midnight: bool = True
    retention_count: int = Field(30, ge=5, le=100)
    drive_enabled: bool = False
    drive_interval_hours: int = Field(4, ge=1, le=24)


@router.put("/settings")
def update_settings(payload: BackupSettingsIn, _u=Depends(require_admin)):
    cfg = payload.model_dump()
    _save_settings(cfg)
    try: _reschedule(cfg)
    except Exception as e: logger.warning("Reschedule failed: %s", e)
    return cfg


# ── Status / List ─────────────────────────────────────────────────────────────

@router.get("/status")
def get_status(_u=Depends(require_admin)):
    files = _list_backups()
    cfg   = _load_settings()
    sched = _scheduler is not None and _scheduler.running
    base  = {
        "scheduler_running": sched,
        "next_backup_local": _next_run("local_interval"),
        "next_backup_daily": _next_run("daily_midnight"),
        "last_auto_backup": _last_auto_backup,
        "last_auto_error": _last_auto_error,
        "schedule": f"كل {cfg.get('local_interval_hours', 2)} ساعة تلقائياً",
        "retention_count": cfg.get("retention_count", 30),
        "drive_enabled": cfg.get("drive_enabled", False),
    }
    if not files:
        return {**base, "count": 0, "total_size": 0, "total_size_human": "0 B", "latest": None}
    latest = files[0]
    mtime  = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
    return {
        **base,
        "count": len(files),
        "total_size": sum(f.stat().st_size for f in files),
        "total_size_human": _human(sum(f.stat().st_size for f in files)),
        "latest": {
            "name": latest.name,
            "created_at": mtime.isoformat(),
            "age_seconds": int((datetime.now(timezone.utc) - mtime).total_seconds()),
        },
    }


@router.get("")
def list_backups(_u=Depends(require_admin)):
    return [
        {
            "name": f.name,
            "size": f.stat().st_size,
            "size_human": _human(f.stat().st_size),
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
            "trigger": _infer_trigger(f.name),
            "drive_status": "not_configured",
        }
        for f in _list_backups()
    ]


# ── Run / Download / Delete / Restore ────────────────────────────────────────

@router.post("/run")
def run_now(request: Request, db=Depends(get_db), current=Depends(require_admin)):
    try:
        fp  = _do_backup(db, trigger="manual")
        sh  = _human(fp.stat().st_size)
        log_action(db, current["_id"], "backup_run", "system", None,
                   after={"file": fp.name, "size": sh}, request=request)
        return {"detail": f"✅ النسخة الاحتياطية تمت بنجاح — {sh}",
                "file": fp.name, "size": sh}
    except Exception as exc:
        log_action(db, current["_id"], "backup_failed", "system", None,
                   after={"error": str(exc)[:400]}, request=request)
        raise HTTPException(500, f"فشل إنشاء النسخة الاحتياطية: {exc}")


@router.get("/download/{filename}")
def download(filename: str, _u=Depends(require_admin)):
    if not _valid_name(filename):
        raise HTTPException(400, "اسم ملف غير صحيح")
    fp = BACKUP_DIR / filename
    if not fp.exists():
        raise HTTPException(404, "الملف غير موجود")
    return FileResponse(str(fp), media_type="application/gzip", filename=filename)


@router.delete("/{filename}", status_code=204)
def delete_backup(filename: str, request: Request,
                  db=Depends(get_db), current=Depends(require_admin)):
    if not _valid_name(filename):
        raise HTTPException(400, "اسم ملف غير صحيح")
    fp = BACKUP_DIR / filename
    if not fp.exists():
        raise HTTPException(404, "الملف غير موجود")
    size = fp.stat().st_size
    fp.unlink()
    log_action(db, current["_id"], "backup_deleted", "system", None,
               before={"name": filename, "size": size}, request=request)
    return None


class RestorePayload(BaseModel):
    confirm: str          = Field(..., description="must equal 'RESTORE_DATABASE'")
    current_password: str = Field(..., min_length=1)


@router.post("/restore/{filename}")
def restore(filename: str, payload: RestorePayload,
            request: Request, db=Depends(get_db), current=Depends(require_admin)):
    if not _valid_name(filename):
        raise HTTPException(400, "اسم ملف غير صحيح")
    fp = BACKUP_DIR / filename
    if not fp.exists():
        raise HTTPException(404, "الملف غير موجود")
    if payload.confirm != "RESTORE_DATABASE":
        raise HTTPException(400, "عبارة التأكيد غير صحيحة")
    if not verify_password(payload.current_password, current["password_hash"]):
        raise HTTPException(401, "كلمة المرور غير صحيحة")
    if not filename.endswith(".json.gz"):
        raise HTTPException(400, "الاستعادة متاحة فقط لملفات .json.gz")

    # Create safety backup first
    safety_name = "FAILED"
    try:
        safety_name = _do_backup(db, trigger="safety").name
    except Exception: pass

    try:
        with gzip.open(str(fp), "rt", encoding="utf-8") as fh:
            backup = json.load(fh)
    except Exception as exc:
        raise HTTPException(400, f"تعذّر قراءة ملف النسخة الاحتياطية: {exc}")

    col_data = backup.get("data", {})
    restored = 0
    for col_name, rows in col_data.items():
        try:
            db[col_name].drop()
            if rows:
                db[col_name].insert_many(rows)
            restored += 1
        except Exception:
            pass

    log_action(db, current["_id"], "restore_success", "system", None,
               after={"file": filename, "safety_backup": safety_name,
                      "collections_restored": restored}, request=request)
    return {
        "detail": "✅ تمت الاستعادة بنجاح — يرجى تسجيل الدخول من جديد",
        "restored_from": filename,
        "collections_restored": restored,
        "safety_backup_created": safety_name,
    }
