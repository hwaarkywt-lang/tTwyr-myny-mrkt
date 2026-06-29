"""Offline sync queue — MongoDB (minimal). Frontend pushes queued requests on reconnect."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from database import get_db, C
from models import new_id
from utils.deps import get_current_user

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/status")
def sync_status(db = Depends(get_db), _u = Depends(get_current_user)):
    pending = db[C.sync_queue].count_documents({"status": "pending"})
    return {"pending": pending, "server_time": datetime.now(timezone.utc).isoformat()}


@router.post("/queue")
def enqueue(payload: dict, db = Depends(get_db), current = Depends(get_current_user)):
    qid = new_id()
    db[C.sync_queue].insert_one({
        "_id": qid, "user_id": current["_id"], "payload": payload,
        "status": "pending", "created_at": datetime.now(timezone.utc),
    })
    return {"id": qid, "status": "queued"}
