"""Day close summary — MongoDB minimal.

Frontend uses both `/api/day-closes` (plural list/preview) and
`/api/day-close/summary` (singular). Both are supported.
"""
from datetime import datetime, timezone, date as _date
from fastapi import APIRouter, Depends
from typing import Optional

from database import get_db, C
from utils.deps import require_manager

router = APIRouter(prefix="/api", tags=["day-close"])


def _summary(db, target: _date) -> dict:
    start = datetime.combine(target, datetime.min.time()).replace(tzinfo=timezone.utc)
    end = datetime.combine(target, datetime.max.time()).replace(tzinfo=timezone.utc)

    sales_agg = list(db[C.sales].aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end},
                    "status": "completed", "deleted_at": None}},
        {"$group": {"_id": "$payment_method", "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]))
    total_sales = sum(x["total"] for x in sales_agg)
    expenses_agg = list(db[C.expenses].aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end}, "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]))
    total_expenses = expenses_agg[0]["total"] if expenses_agg else 0
    returns_agg = list(db[C.sale_returns].aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end}, "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]))
    total_returns = returns_agg[0]["total"] if returns_agg else 0
    return {
        "date": target.isoformat(),
        "total_sales": total_sales, "total_expenses": total_expenses,
        "total_returns": total_returns,
        "net": total_sales - total_expenses - total_returns,
        "by_payment": {x["_id"]: {"total": x["total"], "count": x["count"]} for x in sales_agg},
    }


@router.get("/day-close/summary")
def summary_singular(date: Optional[str] = None, db = Depends(get_db),
                     _u = Depends(require_manager)):
    target = _date.fromisoformat(date) if date else _date.today()
    return _summary(db, target)


@router.get("/day-closes")
def list_day_closes(limit: int = 30, db = Depends(get_db),
                    _u = Depends(require_manager)):
    rows = list(db[C.day_closes].find({}).sort("close_date", -1).limit(limit))
    return [{
        "id": r["_id"], "close_date": r.get("close_date"),
        "total_sales": r.get("total_sales", 0),
        "total_expenses": r.get("total_expenses", 0),
        "net": r.get("net", 0),
        "closed_by": r.get("closed_by"),
        "closed_at": r.get("closed_at"),
    } for r in rows]


@router.get("/day-closes/preview")
def preview_day_close(date: Optional[str] = None, db = Depends(get_db),
                      _u = Depends(require_manager)):
    target = _date.fromisoformat(date) if date else _date.today()
    return _summary(db, target)
