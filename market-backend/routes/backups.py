"""Backup management — MongoDB. Uses mongodump for backups (.archive.gz)."""
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from database import get_db, C
from utils.deps import require_admin
from utils.audit import log_action
from utils.security import verify_password

router = APIRouter(prefix="/api/admin/backups", tags=["backups"])

BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/app/backups"))
SCRIPT_PATH = Path(os.environ.get("BACKUP_SCRIPT",
                                  "/app/scripts/backup_db.sh"
                                  if Path("/app/scripts/backup_db.sh").exists()
                                  else "/app/backend/scripts/backup_db.sh"))
RESTORE_SCRIPT = Path(os.environ.get("RESTORE_SCRIPT",
                                     "/app/scripts/restore_db.sh"
                                     if Path("/app/scripts/restore_db.sh").exists()
                                     else "/app/backend/scripts/restore_db.sh"))


def _human(n):
    s = float(n)
    for u in ["B", "KB", "MB", "GB"]:
        if s < 1024:
            return f"{s:.1f} {u}"
        s /= 1024
    return f"{s:.1f} TB"


def _list_backups():
    BACKUP_DIR.mkdir(exist_ok=True, parents=True)
    return sorted(list(BACKUP_DIR.glob("market_db_*.sql.gz")) +
                  list(BACKUP_DIR.glob("market_db_*.archive.gz")), reverse=True)


@router.get("")
def list_backups(_u = Depends(require_admin)):
    files = _list_backups()
    return [{
        "name": f.name, "size": f.stat().st_size,
        "size_human": _human(f.stat().st_size),
        "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
    } for f in files]


@router.get("/status")
def status(_u = Depends(require_admin)):
    files = _list_backups()
    if not files:
        return {"count": 0, "total_size": 0, "latest": None,
                "schedule": "كل 24 ساعة"}
    latest = files[0]
    total = sum(f.stat().st_size for f in files)
    mtime = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
    return {
        "count": len(files), "total_size": total, "total_size_human": _human(total),
        "latest": {"name": latest.name,
                    "created_at": mtime.isoformat(),
                    "age_seconds": int((datetime.now(timezone.utc) - mtime).total_seconds())},
        "schedule": "كل 24 ساعة", "retention_days": 14,
    }


@router.post("/run")
def run_now(request: Request, db = Depends(get_db),
            current = Depends(require_admin)):
    if not SCRIPT_PATH.exists():
        raise HTTPException(500, "Backup script not found")
    try:
        os.chmod(SCRIPT_PATH, 0o755)
        r = subprocess.run(["/bin/bash", str(SCRIPT_PATH)],
                           capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            log_action(db, current["_id"], "backup_failed", "system", None,
                       after={"stderr": r.stderr[:500]}, request=request)
            raise HTTPException(500, f"Backup failed: {r.stderr[:300]}")
        log_action(db, current["_id"], "backup_run", "system", None,
                   after={"stdout": r.stdout[-300:]}, request=request)
        return {"detail": "✅ النسخة الاحتياطية تمت بنجاح", "log": r.stdout[-500:]}
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Backup timed out (>180s)")


@router.get("/download/{filename}")
def download(filename: str, _u = Depends(require_admin)):
    _validate(filename)
    fp = BACKUP_DIR / filename
    if not fp.exists():
        raise HTTPException(404, "الملف غير موجود")
    return FileResponse(str(fp), media_type="application/gzip", filename=filename)


@router.delete("/{filename}", status_code=204)
def delete(filename: str, request: Request, db = Depends(get_db),
           current = Depends(require_admin)):
    _validate(filename)
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
            db = Depends(get_db), current = Depends(require_admin)):
    _validate(filename)
    fp = BACKUP_DIR / filename
    if not fp.exists():
        raise HTTPException(404, "الملف غير موجود")
    if payload.confirm != "RESTORE_DATABASE":
        raise HTTPException(400, "عبارة التأكيد غير صحيحة")
    if not verify_password(payload.current_password, current["password_hash"]):
        raise HTTPException(401, "كلمة المرور غير صحيحة")
    if not RESTORE_SCRIPT.exists():
        raise HTTPException(500, "Restore script not found")

    safety = None
    if SCRIPT_PATH.exists():
        try:
            sb = subprocess.run(["/bin/bash", str(SCRIPT_PATH)],
                                capture_output=True, text=True, timeout=180)
            if sb.returncode == 0:
                files = _list_backups()
                safety = files[0].name if files else None
        except Exception:
            safety = "FAILED"

    try:
        os.chmod(RESTORE_SCRIPT, 0o755)
        r = subprocess.run(["/bin/bash", str(RESTORE_SCRIPT), str(fp)],
                           capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            log_action(db, current["_id"], "restore_failed", "system", None,
                       after={"file": filename, "stderr": r.stderr[:500]}, request=request)
            raise HTTPException(500, f"Restore failed: {r.stderr[:300]}")
        log_action(db, current["_id"], "restore_success", "system", None,
                   after={"file": filename, "safety_backup": safety}, request=request)
        return {"detail": "✅ تمت الاستعادة بنجاح — يرجى تسجيل الدخول من جديد",
                "restored_from": filename, "safety_backup_created": safety}
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Restore timed out (>300s)")


def _validate(filename: str):
    if "/" in filename or ".." in filename or not filename.startswith("market_db_") \
            or not (filename.endswith(".sql.gz") or filename.endswith(".archive.gz")):
        raise HTTPException(400, "اسم ملف غير صحيح")
