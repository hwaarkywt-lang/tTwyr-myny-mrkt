"""Audit log viewing — MongoDB. Admin only."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from database import get_db, C
from utils.deps import require_admin

router = APIRouter(prefix="/api/audit-logs", tags=["audit"])


@router.get("/actions")
def list_actions(db = Depends(get_db), _u = Depends(require_admin)):
    actions = db[C.audit_logs].distinct("action")
    return sorted(actions)


@router.get("")
def list_audit(action: Optional[str] = None, entity: Optional[str] = None,
               user_id: Optional[str] = None, limit: int = Query(100, le=500),
               db = Depends(get_db), _u = Depends(require_admin)):
    filt = {}
    if action:
        filt["action"] = action
    if entity:
        filt["entity"] = entity
    if user_id:
        filt["user_id"] = user_id
    rows = list(db[C.audit_logs].find(filt).sort("created_at", -1).limit(limit))
    return [{
        "id": r["_id"], "user_id": r.get("user_id"), "action": r.get("action"),
        "entity": r.get("entity"), "entity_id": r.get("entity_id"),
        "before_data": r.get("before_data"), "after_data": r.get("after_data"),
        "ip_address": r.get("ip_address"), "user_agent": r.get("user_agent"),
        "created_at": r.get("created_at"),
    } for r in rows]
