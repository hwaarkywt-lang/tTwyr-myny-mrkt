"""Auth endpoints — MongoDB."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from database import get_db, C
from models import doc, new_id
from schemas.auth import LoginRequest, UserCreate, UserOut, TokenResponse
from utils.security import hash_password, verify_password, create_access_token
from utils.deps import get_current_user, require_admin
from utils.audit import log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])

LOCK_THRESHOLD = 5
LOCK_DURATION_MIN = 15


def _user_dict(u) -> dict:
    return {
        "id": u["_id"], "username": u["username"], "email": u["email"],
        "full_name": u["full_name"], "role": u["role"], "phone": u.get("phone"),
        "is_active": u.get("is_active", True),
        "last_login_at": u.get("last_login_at"),
        "created_at": u.get("created_at"),
    }


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, response: Response, db = Depends(get_db)):
    identifier = payload.email_or_username.strip().lower()
    u = db[C.users].find_one({
        "$or": [{"email": identifier}, {"username": identifier}],
        "deleted_at": None,
    })

    now = datetime.now(timezone.utc)
    if not u:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    locked_until = u.get("locked_until")
    if locked_until and locked_until > now:
        raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")
    if not u.get("is_active"):
        raise HTTPException(status_code=403, detail="Account disabled")

    if not verify_password(payload.password, u["password_hash"]):
        new_attempts = (u.get("failed_login_attempts") or 0) + 1
        update = {"failed_login_attempts": new_attempts}
        if new_attempts >= LOCK_THRESHOLD:
            update["locked_until"] = now + timedelta(minutes=LOCK_DURATION_MIN)
        db[C.users].update_one({"_id": u["_id"]}, {"$set": update})
        log_action(db, u["_id"], "login_failed", "users", u["_id"], request=request)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # success
    db[C.users].update_one({"_id": u["_id"]}, {"$set": {
        "failed_login_attempts": 0, "locked_until": None, "last_login_at": now,
    }})
    log_action(db, u["_id"], "login_success", "users", u["_id"], request=request)

    u["last_login_at"] = now
    token = create_access_token(u["_id"], u["username"], u["role"])
    response.set_cookie(
        key="access_token", value=token, httponly=True, samesite="lax",
        max_age=60 * 60 * 24, path="/",
    )
    return TokenResponse(access_token=token, user=UserOut.model_validate(_user_dict(u)))


@router.post("/logout")
def logout(response: Response, current = Depends(get_current_user),
           db = Depends(get_db), request: Request = None):
    response.delete_cookie("access_token", path="/")
    log_action(db, current["_id"], "logout", "users", current["_id"], request=request)
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserOut)
def me(current = Depends(get_current_user)):
    return UserOut.model_validate(_user_dict(current))


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, request: Request, db = Depends(get_db),
             current = Depends(require_admin)):
    """Only admin can register new employees."""
    email = payload.email.lower().strip()
    username = payload.username.lower().strip()
    if db[C.users].find_one({"$or": [{"email": email}, {"username": username}]}):
        raise HTTPException(status_code=409, detail="Email or username already exists")
    now = datetime.now(timezone.utc)
    user_id = new_id()
    role_val = payload.role.value if hasattr(payload.role, "value") else str(payload.role)
    db[C.users].insert_one({
        "_id": user_id, "username": username, "email": email,
        "full_name": payload.full_name,
        "password_hash": hash_password(payload.password),
        "role": role_val, "phone": payload.phone, "is_active": True,
        "last_login_at": None, "failed_login_attempts": 0, "locked_until": None,
        "created_by": current["_id"],
        "created_at": now, "updated_at": now, "deleted_at": None,
    })
    log_action(db, current["_id"], "user_created", "users", user_id,
               after={"username": username, "email": email, "role": role_val}, request=request)
    u = db[C.users].find_one({"_id": user_id})
    return UserOut.model_validate(_user_dict(u))
