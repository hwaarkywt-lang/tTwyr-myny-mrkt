"""Audit log helper — MongoDB version. Inserts directly; no commit needed."""
from datetime import datetime, timezone
from typing import Optional
from fastapi import Request

from database import C
from models import new_id


def log_action(
    db,
    user_id: Optional[str],
    action: str,
    entity: Optional[str] = None,
    entity_id: Optional[str] = None,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    request: Optional[Request] = None,
):
    """Append an audit log entry. In Mongo there's no `commit` — insert is atomic."""
    ip = None
    ua = None
    if request is not None:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")
    entry = {
        "_id": new_id(),
        "user_id": user_id,
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "before_data": before,
        "after_data": after,
        "ip_address": ip,
        "user_agent": ua,
        "created_at": datetime.now(timezone.utc),
    }
    db[C.audit_logs].insert_one(entry)
    return entry
