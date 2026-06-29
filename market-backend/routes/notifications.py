"""Notifications — MongoDB."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from database import get_db, C
from utils.deps import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(db = Depends(get_db), current = Depends(get_current_user)):
    rows = list(db[C.notifications].find({
        "$or": [{"user_id": current["_id"]}, {"user_id": None}],
    }).sort("created_at", -1).limit(50))
    return [{"id": n["_id"], "title": n.get("title"), "body": n.get("body"),
             "type": n.get("type"), "read": n.get("read", False),
             "created_at": n.get("created_at")} for n in rows]


@router.get("/unread-count")
def unread_count(db = Depends(get_db), current = Depends(get_current_user)):
    n = db[C.notifications].count_documents({
        "$or": [{"user_id": current["_id"]}, {"user_id": None}],
        "read": {"$ne": True},
    })
    return {"unread": n}


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, db = Depends(get_db), current = Depends(get_current_user)):
    db[C.notifications].update_one({"_id": notification_id},
                                   {"$set": {"read": True,
                                             "read_at": datetime.now(timezone.utc)}})
    return {"detail": "ok"}
