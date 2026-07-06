"""Backup management — Pure-Python JSON export (works with mongomock & real MongoDB)."""
import gzip
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from database import get_db, C
from models import new_id
from utils.deps import require_admin
from utils.audit import log_action
from utils.security import verify_password

router = APIRouter(prefix="/api/admin/backups", tags=["backups"])

# ── storage directory ─────────────────────────────────────────────────────────
_DEFAULT_DIR = Path(os.environ.get("BACKUP_DIR", "")).expanduser() \
               if os.environ.get("BACKUP_DIR") else None
# Use workspace-relative writable path (avoids read-only /app in Replit)
BACKUP_DIR = _DEFAULT_DIR or Path(__file__).resolve().parent.parent / "data" / "backups"


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


# ── All collections to export ─────────────────────────────────────────────────
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
    """JSON serialiser for non-serialisable types (datetime, Decimal, etc.)."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    try:
        from decimal import Decimal
        if isinstance(obj, Decimal):
            return float(obj)
    except ImportError:
        pass
    # fallback — turn anything else to string
    return str(obj)


def _do_backup(db) -> Path:
    """Export every collection to a gzipped JSON file. Returns the file path."""
    BACKUP_DIR.mkdir(exist_ok=True, parents=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filepath = BACKUP_DIR / f"market_db_{timestamp}.json.gz"

    data: dict = {}
    for col_name in _COLLECTIONS:
        try:
            col_attr = getattr(C, col_name) if hasattr(C, col_name) else col_name
        except Exception:
            col_attr = col_name
        try:
            rows = list(db[col_name].find())
            # convert _id → id for readability; keep _id as well
            serialisable = []
            for r in rows:
                rec = {}
                for k, v in r.items():
                    rec[k] = v
                serialisable.append(rec)
            data[col_name] = serialisable
        except Exception:
            data[col_name] = []

    meta = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "collections": len(data),
        "total_documents": sum(len(v) for v in data.values()),
        "format_version": "1.0",
    }
    payload = {"meta": meta, "data": data}

    with gzip.open(str(filepath), "wt", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, default=_json_default, indent=None)

    # Delete oldest beyond retention=14
    all_files = _list_backups()
    for old in all_files[14:]:
        try:
            old.unlink()
        except Exception:
            pass

    return filepath


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_backups(_u=Depends(require_admin)):
    files = _list_backups()
    return [
        {
            "name": f.name,
            "size": f.stat().st_size,
            "size_human": _human(f.stat().st_size),
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
        }
        for f in files
    ]


@router.get("/status")
def status(_u=Depends(require_admin)):
    files = _list_backups()
    if not files:
        return {"count": 0, "total_size": 0, "latest": None, "schedule": "يدوي / عند الطلب"}
    latest = files[0]
    total = sum(f.stat().st_size for f in files)
    mtime = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
    return {
        "count": len(files),
        "total_size": total,
        "total_size_human": _human(total),
        "latest": {
            "name": latest.name,
            "created_at": mtime.isoformat(),
            "age_seconds": int((datetime.now(timezone.utc) - mtime).total_seconds()),
        },
        "schedule": "يدوي / عند الطلب",
        "retention_days": 14,
    }


@router.post("/run")
def run_now(request: Request, db=Depends(get_db), current=Depends(require_admin)):
    """Create a new JSON backup of every collection."""
    try:
        filepath = _do_backup(db)
        size_human = _human(filepath.stat().st_size)
        log_action(
            db, current["_id"], "backup_run", "system", None,
            after={"file": filepath.name, "size": size_human}, request=request,
        )
        return {
            "detail": f"✅ النسخة الاحتياطية تمت بنجاح — {size_human}",
            "file": filepath.name,
            "size": size_human,
        }
    except Exception as exc:
        log_action(db, current["_id"], "backup_failed", "system", None,
                   after={"error": str(exc)[:400]}, request=request)
        raise HTTPException(status_code=500, detail=f"فشل إنشاء النسخة الاحتياطية: {exc}")


@router.get("/download/{filename}")
def download(filename: str, _u=Depends(require_admin)):
    if not _valid_name(filename):
        raise HTTPException(400, "اسم ملف غير صحيح")
    fp = BACKUP_DIR / filename
    if not fp.exists():
        raise HTTPException(404, "الملف غير موجود")
    return FileResponse(str(fp), media_type="application/gzip", filename=filename)


@router.delete("/{filename}", status_code=204)
def delete(filename: str, request: Request, db=Depends(get_db), current=Depends(require_admin)):
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
    confirm: str = Field(..., description="must equal 'RESTORE_DATABASE'")
    current_password: str = Field(..., min_length=1)


@router.post("/restore/{filename}")
def restore(filename: str, payload: RestorePayload, request: Request,
            db=Depends(get_db), current=Depends(require_admin)):
    if not _valid_name(filename):
        raise HTTPException(400, "اسم ملف غير صحيح")
    fp = BACKUP_DIR / filename
    if not fp.exists():
        raise HTTPException(404, "الملف غير موجود")
    if payload.confirm != "RESTORE_DATABASE":
        raise HTTPException(400, "عبارة التأكيد غير صحيحة")
    if not verify_password(payload.current_password, current["password_hash"]):
        raise HTTPException(401, "كلمة المرور غير صحيحة")

    # Only JSON backups are restorable
    if not filename.endswith(".json.gz"):
        raise HTTPException(400, "الاستعادة متاحة فقط لملفات .json.gz — الملفات القديمة (.sql.gz / .archive.gz) للتحميل فقط")

    # Safety backup first
    safety_name = None
    try:
        safety_fp = _do_backup(db)
        safety_name = safety_fp.name
    except Exception:
        safety_name = "FAILED"

    # Load backup and restore
    try:
        with gzip.open(str(fp), "rt", encoding="utf-8") as fh:
            backup = json.load(fh)
    except Exception as exc:
        raise HTTPException(400, f"تعذّر قراءة ملف النسخة الاحتياطية: {exc}")

    col_data: dict = backup.get("data", {})
    restored_cols = 0
    for col_name, rows in col_data.items():
        try:
            # Always drop to remove stale data, even when backup has 0 rows
            db[col_name].drop()
            if rows:
                db[col_name].insert_many(rows)
            restored_cols += 1
        except Exception:
            pass

    log_action(db, current["_id"], "restore_success", "system", None,
               after={"file": filename, "safety_backup": safety_name,
                      "collections_restored": restored_cols}, request=request)
    return {
        "detail": "✅ تمت الاستعادة بنجاح — يرجى تسجيل الدخول من جديد",
        "restored_from": filename,
        "collections_restored": restored_cols,
        "safety_backup_created": safety_name,
    }
