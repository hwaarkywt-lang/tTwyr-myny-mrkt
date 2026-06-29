"""FastAPI dependencies: current user resolution + role guards (MongoDB)."""
import jwt
from fastapi import Depends, HTTPException, status, Request

from database import get_db, C
from models import UserRole, doc
from utils.security import decode_token


def get_current_user(request: Request, db = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    u = db[C.users].find_one({"_id": user_id, "deleted_at": None})
    if not u or not u.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return doc(u)


def require_roles(*roles):
    allowed = {r.value if isinstance(r, UserRole) else r for r in roles}

    def _checker(current_user = Depends(get_current_user)):
        role_val = current_user.role.value if isinstance(current_user.role, UserRole) else current_user.role
        if role_val not in allowed and role_val != "admin":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    return _checker


require_manager = require_roles(UserRole.admin, UserRole.manager)
require_cashier = require_roles(UserRole.admin, UserRole.manager, UserRole.cashier)


def require_admin(current_user = Depends(get_current_user)):
    role_val = current_user.role.value if isinstance(current_user.role, UserRole) else current_user.role
    if role_val != "admin":
        raise HTTPException(status_code=403, detail="هذه العملية تتطلب صلاحية المدير")
    return current_user
