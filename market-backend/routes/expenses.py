"""Expenses — MongoDB."""
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List, Optional

from database import get_db, C
from models import new_id
from schemas.expenses import ExpenseCreate, ExpenseOut, ExpenseCategoryOut
from utils.deps import require_manager, get_current_user
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["expenses"])


@router.get("/expense-categories", response_model=List[ExpenseCategoryOut])
def list_categories(db = Depends(get_db), _u = Depends(get_current_user)):
    rows = list(db[C.expense_categories].find({"is_active": True}).sort("name", 1))
    return [ExpenseCategoryOut.model_validate({
        "id": r["_id"], "name": r["name"], "is_active": r.get("is_active", True),
        "created_at": r.get("created_at"),
    }) for r in rows]


@router.get("/expenses", response_model=List[ExpenseOut])
def list_expenses(limit: int = 100, db = Depends(get_db), _u = Depends(require_manager)):
    rows = list(db[C.expenses].find({"deleted_at": None}).sort("created_at", -1).limit(limit))
    out = []
    for e in rows:
        cat = db[C.expense_categories].find_one({"_id": e.get("category_id")}) if e.get("category_id") else None
        out.append({
            "id": e["_id"], "category_id": e.get("category_id"),
            "category_name": cat["name"] if cat else None,
            "amount": e.get("amount", 0), "description": e.get("description"),
            "payment_method": e.get("payment_method", "cash"),
            "created_by": e.get("created_by"), "created_at": e.get("created_at"),
        })
    return [ExpenseOut.model_validate(o) for o in out]


@router.post("/expenses", response_model=ExpenseOut, status_code=201)
def create_expense(payload: ExpenseCreate, request: Request,
                   db = Depends(get_db), current = Depends(require_manager)):
    now = datetime.now(timezone.utc)
    eid = new_id()
    db[C.expenses].insert_one({
        "_id": eid, "category_id": payload.category_id,
        "amount": float(payload.amount),
        "description": payload.description,
        "payment_method": payload.payment_method,
        "created_by": current["_id"],
        "created_at": now, "updated_at": now, "deleted_at": None,
    })
    log_action(db, current["_id"], "expense_created", "expenses", eid,
               after={"amount": str(payload.amount)}, request=request)
    e = db[C.expenses].find_one({"_id": eid})
    cat = db[C.expense_categories].find_one({"_id": e.get("category_id")})
    return ExpenseOut.model_validate({
        "id": e["_id"], "category_id": e.get("category_id"),
        "category_name": cat["name"] if cat else None,
        "amount": e["amount"], "description": e.get("description"),
        "payment_method": e.get("payment_method"),
        "created_by": e.get("created_by"), "created_at": e.get("created_at"),
    })
