"""Expenses — MongoDB."""
from datetime import datetime, timezone, date as _date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from typing import List, Optional

from database import get_db, C
from models import new_id
from schemas.expenses import ExpenseCreate, ExpenseOut, ExpenseCategoryOut
from utils.deps import require_manager, get_current_user, require_cashier
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["expenses"])


@router.get("/expense-categories", response_model=List[ExpenseCategoryOut])
def list_categories(db=Depends(get_db), _u=Depends(get_current_user)):
    rows = list(db[C.expense_categories].find({"is_active": True}).sort("name", 1))
    return [ExpenseCategoryOut.model_validate({
        "id": r["_id"], "name": r["name"], "is_active": r.get("is_active", True),
        "created_at": r.get("created_at"),
    }) for r in rows]


def _expense_out(e, cat) -> dict:
    return {
        "id": e["_id"],
        "category_id": e.get("category_id"),
        "category_name": cat["name"] if cat else None,
        "amount": e.get("amount", 0),
        "description": e.get("description"),
        "paid_to": e.get("paid_to"),
        "payment_method": e.get("payment_method", "cash"),
        "expense_date": e.get("expense_date"),   # stored as date string YYYY-MM-DD
        "created_by": e.get("created_by"),
        "created_at": e.get("created_at"),
    }


@router.get("/expenses", response_model=List[ExpenseOut])
def list_expenses(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(500, le=1000),
    db=Depends(get_db),
    current=Depends(require_cashier),
):
    filt: dict = {"deleted_at": None}

    # If cashier — only show their own expenses
    if current.role == "cashier":
        filt["created_by"] = current["_id"]

    # Filter by expense_date string (YYYY-MM-DD) or fall back to created_at
    if date_from or date_to:
        date_cond: dict = {}
        if date_from:
            date_cond["$gte"] = date_from
        if date_to:
            date_cond["$lte"] = date_to
        # Try expense_date first; if missing, fall back to created_at comparison is done client-side
        filt["expense_date"] = date_cond

    rows = list(db[C.expenses].find(filt).sort("expense_date", -1).limit(limit))
    out = []
    for e in rows:
        cat = db[C.expense_categories].find_one({"_id": e.get("category_id")}) if e.get("category_id") else None
        out.append(_expense_out(e, cat))
    return [ExpenseOut.model_validate(o) for o in out]


@router.post("/expenses", response_model=ExpenseOut, status_code=201)
def create_expense(
    payload: ExpenseCreate,
    request: Request,
    db=Depends(get_db),
    current=Depends(require_cashier),
):
    now = datetime.now(timezone.utc)
    # Use provided expense_date or today
    expense_date_str = str(payload.expense_date) if payload.expense_date else now.strftime("%Y-%m-%d")
    eid = new_id()
    db[C.expenses].insert_one({
        "_id": eid,
        "category_id": payload.category_id,
        "amount": float(payload.amount),
        "description": payload.description,
        "paid_to": payload.paid_to,
        "payment_method": payload.payment_method,
        "expense_date": expense_date_str,
        "created_by": current["_id"],
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    })
    log_action(db, current["_id"], "expense_created", "expenses", eid,
               after={"amount": str(payload.amount), "expense_date": expense_date_str}, request=request)
    e = db[C.expenses].find_one({"_id": eid})
    cat = db[C.expense_categories].find_one({"_id": e.get("category_id")}) if e.get("category_id") else None
    return ExpenseOut.model_validate(_expense_out(e, cat))
