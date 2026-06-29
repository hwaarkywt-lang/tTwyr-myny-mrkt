"""User management — MongoDB. Admin only."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from typing import List

from database import get_db, C
from schemas.auth import UserOut, UserUpdate
from utils.deps import require_admin
from utils.security import hash_password
from utils.audit import log_action

router = APIRouter(prefix="/api/users", tags=["users"])


def _user_dict(u) -> dict:
    return {
        "id": u["_id"], "username": u["username"], "email": u["email"],
        "full_name": u["full_name"], "role": u["role"], "phone": u.get("phone"),
        "is_active": u.get("is_active", True),
        "last_login_at": u.get("last_login_at"),
        "created_at": u.get("created_at"),
    }


@router.get("", response_model=List[UserOut])
def list_users(db = Depends(get_db), current = Depends(require_admin)):
    rows = list(db[C.users].find({"deleted_at": None}).sort("created_at", -1))
    return [UserOut.model_validate(_user_dict(u)) for u in rows]


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: str, payload: UserUpdate, request: Request,
                db = Depends(get_db), current = Depends(require_admin)):
    u = db[C.users].find_one({"_id": user_id, "deleted_at": None})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    before = {"full_name": u["full_name"], "role": u["role"], "is_active": u.get("is_active", True)}
    data = payload.model_dump(exclude_unset=True)
    update = {}
    if "password" in data and data["password"]:
        update["password_hash"] = hash_password(data.pop("password"))
    for k, v in data.items():
        if hasattr(v, "value"):
            v = v.value
        update[k] = v
    update["updated_at"] = datetime.now(timezone.utc)
    db[C.users].update_one({"_id": user_id}, {"$set": update})
    after = {k: str(update.get(k, before[k])) for k in before}
    log_action(db, current["_id"], "user_updated", "users", user_id,
               before=before, after=after, request=request)
    u = db[C.users].find_one({"_id": user_id})
    return UserOut.model_validate(_user_dict(u))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def soft_delete_user(user_id: str, request: Request,
                     db = Depends(get_db), current = Depends(require_admin)):
    u = db[C.users].find_one({"_id": user_id, "deleted_at": None})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id == current["_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    now = datetime.now(timezone.utc)
    db[C.users].update_one({"_id": user_id}, {"$set": {
        "deleted_at": now, "is_active": False, "updated_at": now,
    }})
    log_action(db, current["_id"], "user_deleted", "users", user_id, request=request)
    return None
