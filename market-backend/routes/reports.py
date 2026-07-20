"""Reports — MongoDB."""
from datetime import datetime, timezone, timedelta, date as _date
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from database import get_db, C
from utils.deps import require_manager, require_admin, get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _date_range(date_from: Optional[str], date_to: Optional[str]):
    rng = {}
    if date_from:
        rng["$gte"] = datetime.combine(_date.fromisoformat(date_from), datetime.min.time())
    if date_to:
        rng["$lte"] = datetime.combine(_date.fromisoformat(date_to), datetime.max.time())
    return rng


@router.get("/daily")
def daily_sales(date: Optional[str] = None, db = Depends(get_db), _u = Depends(require_manager)):
    target = _date.fromisoformat(date) if date else _date.today()
    start = datetime.combine(target, datetime.min.time())
    end = datetime.combine(target, datetime.max.time())
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end}, "status": "completed", "deleted_at": None}},
        {"$group": {"_id": "$payment_method", "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]
    by_method = {x["_id"]: {"total": x["total"], "count": x["count"]} for x in db[C.sales].aggregate(pipeline)}
    grand_total = sum(v["total"] for v in by_method.values())
    grand_count = sum(v["count"] for v in by_method.values())
    return {
        "date": target.isoformat(), "total_sales": grand_total,
        "transactions_count": grand_count, "by_payment_method": by_method,
    }


@router.get("/monthly")
def monthly_sales(year: Optional[int] = None, month: Optional[int] = None,
                  db = Depends(get_db), _u = Depends(require_manager)):
    today = _date.today()
    y, m = year or today.year, month or today.month
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    end = datetime(y + (m // 12), (m % 12) + 1, 1, tzinfo=timezone.utc)
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lt": end}, "status": "completed", "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]
    agg = list(db[C.sales].aggregate(pipeline))
    return {"year": y, "month": m,
            "total_sales": agg[0]["total"] if agg else 0,
            "transactions_count": agg[0]["count"] if agg else 0}


@router.get("/profits")
def profits(date_from: Optional[str] = None, date_to: Optional[str] = None,
            db = Depends(get_db), _u = Depends(require_admin)):
    """Admin-only profit report (revenue - cost)."""
    rng = _date_range(date_from, date_to)
    sales_filter = {"status": "completed", "deleted_at": None}
    if rng:
        sales_filter["created_at"] = rng
    sale_ids = [s["_id"] for s in db[C.sales].find(sales_filter, {"_id": 1})]
    if not sale_ids:
        return {"revenue": 0, "cost": 0, "profit": 0, "items_count": 0}
    items = list(db[C.sale_items].find({"sale_id": {"$in": sale_ids}}))
    product_ids = list({it["product_id"] for it in items})
    prod_map = {p["_id"]: p for p in
                db[C.products].find({"_id": {"$in": product_ids}}, {"cost_price": 1})}
    revenue = sum(float(it.get("total", 0)) for it in items)
    cost = sum(float(prod_map.get(it["product_id"], {}).get("cost_price", 0) or 0)
               * float(it.get("quantity", 0)) for it in items)
    return {"revenue": revenue, "cost": cost, "profit": revenue - cost,
            "items_count": len(items)}


@router.get("/payment-methods")
def payment_methods_report(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db = Depends(get_db), _u = Depends(require_manager),
):
    """تقرير طرق الدفع مع تجميع وإحصائيات مفصّلة."""
    rng = _date_range(date_from, date_to)
    match_f = {"status": "completed", "deleted_at": None}
    if rng:
        match_f["created_at"] = rng
    pipeline = [
        {"$match": match_f},
        {"$group": {
            "_id": "$payment_method",
            "total": {"$sum": "$total"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"total": -1}},
    ]
    rows = list(db[C.sales].aggregate(pipeline))
    grand_total = sum(float(r["total"]) for r in rows)
    items = []
    for r in rows:
        t = float(r["total"])
        c = int(r["count"])
        items.append({
            "method": r["_id"],
            "total": round(t, 2),
            "count": c,
            "avg": round(t / c, 2) if c else 0,
            "pct": round(t / grand_total * 100, 1) if grand_total > 0 else 0,
        })
    return {"grand_total": round(grand_total, 2), "items": items}


@router.get("/purchases-daily")
def purchases_daily(date: Optional[str] = None, db = Depends(get_db), _u = Depends(require_manager)):
    target = _date.fromisoformat(date) if date else _date.today()
    start = datetime.combine(target, datetime.min.time())
    end = datetime.combine(target, datetime.max.time())
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end}, "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]
    agg = list(db[C.purchases].aggregate(pipeline))
    return {"date": target.isoformat(),
            "total_purchases": agg[0]["total"] if agg else 0,
            "invoices_count": agg[0]["count"] if agg else 0}


@router.get("/purchases-monthly")
def purchases_monthly(year: Optional[int] = None, month: Optional[int] = None,
                      db = Depends(get_db), _u = Depends(require_manager)):
    today = _date.today()
    y, m = year or today.year, month or today.month
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    end = datetime(y + (m // 12), (m % 12) + 1, 1, tzinfo=timezone.utc)
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lt": end}, "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]
    agg = list(db[C.purchases].aggregate(pipeline))
    return {"year": y, "month": m,
            "total_purchases": agg[0]["total"] if agg else 0,
            "invoices_count": agg[0]["count"] if agg else 0}


@router.get("/low-stock")
def low_stock(db = Depends(get_db), _u = Depends(require_manager)):
    rows = list(db[C.products].find({"deleted_at": None, "is_active": True}))
    out = [{"id": p["_id"], "name": p["name"], "current_stock": p.get("current_stock", 0),
            "min_stock_level": p.get("min_stock_level", 0)}
           for p in rows
           if float(p.get("current_stock", 0) or 0) <= float(p.get("min_stock_level", 0) or 0)]
    return out


@router.get("/sales-by-day")
def sales_by_day(days: int = 30, db = Depends(get_db), _u = Depends(require_manager)):
    """Return last N days of total sales for charts."""
    from datetime import timedelta
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end},
                    "status": "completed", "deleted_at": None}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                     "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    return [{"date": r["_id"], "total": r["total"], "count": r["count"]}
            for r in db[C.sales].aggregate(pipeline)]
