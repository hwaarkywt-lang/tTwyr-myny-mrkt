"""Day close summary — MongoDB.

Endpoints:
  GET  /api/day-close/summary          - singular alias (legacy)
  GET  /api/day-closes                 - list past closes
  GET  /api/day-closes/preview         - preview for a date
  POST /api/day-closes                 - submit a day close
"""
from datetime import datetime, timezone, date as _date
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from pydantic import BaseModel

from database import get_db, C
from models import new_id
from utils.deps import require_manager

router = APIRouter(prefix="/api", tags=["day-close"])


def _build_preview(db, target: _date) -> dict:
    """Compute preview numbers for a given business date."""
    start = datetime.combine(target, datetime.min.time()).replace(tzinfo=timezone.utc)
    end   = datetime.combine(target, datetime.max.time()).replace(tzinfo=timezone.utc)

    # Sales total & cash portion
    sales_agg = list(db[C.sales].aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end},
                    "status": "completed", "deleted_at": None}},
        {"$group": {
            "_id": "$payment_method",
            "total": {"$sum": "$total"},
            "count": {"$sum": 1},
        }},
    ]))
    total_sales = sum(float(x["total"]) for x in sales_agg)
    sales_count = sum(int(x["count"]) for x in sales_agg)
    sales_cash  = sum(float(x["total"]) for x in sales_agg if x["_id"] == "cash")
    by_payment  = {x["_id"]: {"total": float(x["total"]), "count": int(x["count"])}
                   for x in sales_agg}

    # Returns
    ret_agg = list(db[C.sale_returns].aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end},
                    "status": "approved", "deleted_at": None}},
        {"$group": {"_id": "$return_type", "total": {"$sum": "$total"}}},
    ]))
    total_returns = sum(float(x["total"]) for x in ret_agg)
    cash_returns  = sum(float(x["total"]) for x in ret_agg if x["_id"] == "cash")

    # Expenses paid in cash only (exclude card/bank expenses from cash box)
    exp_agg = list(db[C.expenses].aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end}, "deleted_at": None,
                    "payment_method": {"$in": ["cash", None, ""]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]))
    expenses_paid = float(exp_agg[0]["total"]) if exp_agg else 0.0
    # Total expenses (all methods, for the net calculation)
    exp_total_agg = list(db[C.expenses].aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end}, "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]))
    total_expenses_all = float(exp_total_agg[0]["total"]) if exp_total_agg else 0.0

    # Supplier payments in cash only
    sp_agg = list(db[C.supplier_payments].aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end},
                    "payment_method": {"$in": ["cash", None, ""]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]))
    supplier_paid = float(sp_agg[0]["total"]) if sp_agg else 0.0

    # Customer receipts in cash only
    cp_agg = list(db[C.customer_payments].aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end},
                    "payment_method": {"$in": ["cash", None, ""]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]))
    customer_receipts = float(cp_agg[0]["total"]) if cp_agg else 0.0

    expected_cash = sales_cash + customer_receipts - expenses_paid - supplier_paid - cash_returns

    # Check if already closed
    existing = db[C.day_closes].find_one({"close_date": target.isoformat()})

    return {
        "date": target.isoformat(),
        "already_closed": bool(existing),
        "closed_at": existing["closed_at"].isoformat() if existing and existing.get("closed_at") else None,
        # Cash breakdown
        "sales_cash": round(sales_cash, 2),
        "customer_receipts": round(customer_receipts, 2),
        "expenses_paid": round(expenses_paid, 2),
        "supplier_paid": round(supplier_paid, 2),
        "cash_returns": round(cash_returns, 2),
        "expected_cash": round(expected_cash, 2),
        # Totals
        "total_sales": round(total_sales, 2),
        "sales_count": sales_count,
        "total_returns": round(total_returns, 2),
        "total_expenses": round(expenses_paid, 2),
        "net": round(total_sales - total_expenses_all - total_returns, 2),
        "by_payment": by_payment,
    }


# ─── GET /api/day-close/summary (singular, legacy alias) ──────────────
@router.get("/day-close/summary")
def summary_singular(date: Optional[str] = None, db=Depends(get_db),
                     _u=Depends(require_manager)):
    target = _date.fromisoformat(date) if date else _date.today()
    return _build_preview(db, target)


# ─── GET /api/day-closes/preview ──────────────────────────────────────
@router.get("/day-closes/preview")
def preview_day_close(date: Optional[str] = None,
                      business_date: Optional[str] = None,
                      db=Depends(get_db), _u=Depends(require_manager)):
    d = business_date or date
    target = _date.fromisoformat(d) if d else _date.today()
    return _build_preview(db, target)


# ─── GET /api/day-closes (history list) ───────────────────────────────
@router.get("/day-closes")
def list_day_closes(limit: int = 30, db=Depends(get_db),
                    _u=Depends(require_manager)):
    rows = list(db[C.day_closes].find({}).sort("close_date", -1).limit(limit))
    return [{
        "id": r["_id"],
        "close_date": r.get("close_date"),
        "total_sales": r.get("total_sales", 0),
        "total_expenses": r.get("total_expenses", 0),
        "total_returns": r.get("total_returns", 0),
        "net": r.get("net", 0),
        "expected_cash": r.get("expected_cash", 0),
        "actual_cash": r.get("actual_cash", 0),
        "variance": r.get("variance", 0),
        "notes": r.get("notes"),
        "closed_by": r.get("closed_by"),
        "closed_at": r.get("closed_at"),
    } for r in rows]


# ─── POST /api/day-closes (submit close) ──────────────────────────────
class DayCloseCreate(BaseModel):
    business_date: str
    actual_cash: float
    notes: Optional[str] = None


@router.post("/day-closes", status_code=201)
def create_day_close(payload: DayCloseCreate, db=Depends(get_db),
                     current=Depends(require_manager)):
    # Idempotency guard (also enforced by unique index on close_date)
    existing = db[C.day_closes].find_one({"close_date": payload.business_date})
    if existing:
        raise HTTPException(409, f"اليوم {payload.business_date} مُقفَل مسبقاً")

    target = _date.fromisoformat(payload.business_date)
    preview = _build_preview(db, target)
    variance = round(payload.actual_cash - preview["expected_cash"], 2)

    now = datetime.now(timezone.utc)
    doc_id = new_id()
    db[C.day_closes].insert_one({
        "_id": doc_id,
        "close_date": payload.business_date,
        "total_sales": preview["total_sales"],
        "total_expenses": preview["total_expenses"],
        "total_returns": preview["total_returns"],
        "net": preview["net"],
        "expected_cash": preview["expected_cash"],
        "actual_cash": payload.actual_cash,
        "variance": variance,
        "by_payment": preview["by_payment"],
        "notes": payload.notes,
        "closed_by": current["_id"],
        "closed_at": now,
    })
    return {
        "id": doc_id,
        "close_date": payload.business_date,
        "expected_cash": preview["expected_cash"],
        "actual_cash": payload.actual_cash,
        "variance": variance,
    }
