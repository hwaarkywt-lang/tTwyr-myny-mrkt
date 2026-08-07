"""Product Batch Inventory — FIFO/LIFO/Specific Identification tracking.

Each purchase creates an independent batch. Sales deduct from batches in the
configured valuation order (default: FIFO). Profit is calculated per batch,
never using an averaged cost.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List

from database import get_db, C
from utils.deps import get_current_user, require_manager

router = APIRouter(prefix="/api", tags=["batches"])

VALID_METHODS = ("fifo", "lifo", "specific")


# ─── Helpers ────────────────────────────────────────────────────────────────

def _batch_out(b: dict, db) -> dict:
    prod = db[C.products].find_one({"_id": b["product_id"]}, {"name": 1, "unit": 1, "sku": 1})
    unit_cost       = float(b.get("unit_cost", 0))
    sale_price      = float(b.get("sale_price", 0))
    original_qty    = float(b.get("original_qty", 0))
    remaining_qty   = float(b.get("remaining_qty", 0))
    units_per_carton = float(b.get("units_per_carton") or 1)
    profit_per_unit = sale_price - unit_cost
    sold_qty        = original_qty - remaining_qty

    return {
        "id":               b["_id"],
        "batch_no":         b.get("batch_no", ""),
        "product_id":       b["product_id"],
        "product_name":     prod["name"]          if prod else b["product_id"],
        "product_unit":     prod.get("unit", "piece") if prod else "piece",
        "product_sku":      prod.get("sku")       if prod else None,
        "purchase_id":      b.get("purchase_id"),
        "purchase_date":    b.get("purchase_date"),
        "supplier_id":      b.get("supplier_id"),
        "supplier_name":    b.get("supplier_name"),
        # Pricing
        "unit_cost":        unit_cost,
        "carton_cost":      b.get("carton_cost"),
        "units_per_carton": units_per_carton,
        "sale_price":       sale_price,
        # Quantities
        "original_qty":     original_qty,
        "remaining_qty":    remaining_qty,
        "sold_qty":         sold_qty,
        # Profit calculations
        "profit_per_unit":  round(profit_per_unit, 4),
        "profit_per_carton":round(profit_per_unit * units_per_carton, 4),
        "batch_value_at_cost": round(remaining_qty * unit_cost, 2),
        "batch_value_at_sale": round(remaining_qty * sale_price, 2),
        "expected_profit":  round(remaining_qty * profit_per_unit, 2),
        "realized_profit":  round(sold_qty * profit_per_unit, 2),
        "is_exhausted":     b.get("is_exhausted", False),
        "created_at":       b.get("created_at"),
        "updated_at":       b.get("updated_at"),
    }


# ─── Batch list ──────────────────────────────────────────────────────────────

@router.get("/batches")
def list_batches(
    product_id:        Optional[str] = None,
    supplier_id:       Optional[str] = None,
    include_exhausted: bool          = False,
    skip:              int           = 0,
    limit:             int           = Query(500, le=2000),
    db=Depends(get_db),
    _u=Depends(require_manager),
):
    """List all product batches — optionally filtered by product or supplier."""
    filt: dict = {}
    if product_id:
        filt["product_id"] = product_id
    if supplier_id:
        filt["supplier_id"] = supplier_id
    if not include_exhausted:
        filt["is_exhausted"] = {"$ne": True}

    rows = list(db[C.product_batches].find(filt)
                .sort("purchase_date", -1).skip(skip).limit(limit))
    return [_batch_out(b, db) for b in rows]


@router.get("/batches/product/{product_id}")
def batches_for_product(
    product_id:        str,
    include_exhausted: bool = False,
    db=Depends(get_db),
    _u=Depends(require_manager),
):
    """All batches for a single product, ordered FIFO (oldest first)."""
    filt: dict = {"product_id": product_id}
    if not include_exhausted:
        filt["is_exhausted"] = {"$ne": True}
    rows = list(db[C.product_batches].find(filt).sort("purchase_date", 1))
    return [_batch_out(b, db) for b in rows]


# ─── Valuation method setting ─────────────────────────────────────────────────

class ValuationMethodIn(BaseModel):
    method: str  # fifo | lifo | specific


@router.get("/settings/valuation-method")
def get_valuation_method(db=Depends(get_db), _u=Depends(get_current_user)):
    s = db[C.settings].find_one({"key": "inventory_valuation_method"})
    return {"method": s["value"] if s else "fifo"}


@router.patch("/settings/valuation-method")
def set_valuation_method(
    payload: ValuationMethodIn,
    db=Depends(get_db),
    _u=Depends(require_manager),
):
    if payload.method not in VALID_METHODS:
        raise HTTPException(400, f"طريقة غير صحيحة. الخيارات: {', '.join(VALID_METHODS)}")
    db[C.settings].update_one(
        {"key": "inventory_valuation_method"},
        {"$set": {"value": payload.method, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"method": payload.method}


# ─── Batch profit report ──────────────────────────────────────────────────────

@router.get("/reports/batch-profits")
def batch_profits_report(
    date_from:  Optional[str] = None,
    date_to:    Optional[str] = None,
    product_id: Optional[str] = None,
    db=Depends(get_db),
    _u=Depends(require_manager),
):
    """
    Gross profit per product — based on actual FIFO/LIFO unit_cost stored in
    sale_items at the time of sale. Never uses averaged cost.
    """
    from routes.reports import _date_range

    filt: dict = {"unit_cost": {"$exists": True, "$gt": 0}}
    if product_id:
        filt["product_id"] = product_id
    if date_from or date_to:
        start, end = _date_range(date_from, date_to)
        filt["created_at"] = {"$gte": start, "$lte": end}

    pipeline = [
        {"$match": filt},
        {"$group": {
            "_id": "$product_id",
            "total_qty":      {"$sum": "$quantity"},
            "total_revenue":  {"$sum": "$total"},
            "total_cost":     {"$sum": {"$multiply": ["$quantity", "$unit_cost"]}},
            "invoice_count":  {"$sum": 1},
        }},
        {"$sort": {"total_revenue": -1}},
    ]

    rows = list(db[C.sale_items].aggregate(pipeline))
    out = []
    for r in rows:
        prod = db[C.products].find_one({"_id": r["_id"]}, {"name": 1, "sku": 1})
        revenue = float(r["total_revenue"])
        cost    = float(r["total_cost"])
        profit  = revenue - cost
        margin  = (profit / revenue * 100) if revenue > 0 else 0
        out.append({
            "product_id":        r["_id"],
            "product_name":      prod["name"]     if prod else r["_id"],
            "product_sku":       prod.get("sku")  if prod else None,
            "total_qty_sold":    float(r["total_qty"]),
            "invoice_count":     r["invoice_count"],
            "total_revenue":     round(revenue, 2),
            "total_cost":        round(cost, 2),
            "gross_profit":      round(profit, 2),
            "profit_margin_pct": round(margin, 2),
        })

    total_revenue = sum(x["total_revenue"] for x in out)
    total_cost    = sum(x["total_cost"]    for x in out)
    total_profit  = sum(x["gross_profit"]  for x in out)

    return {
        "rows": out,
        "totals": {
            "total_revenue":     round(total_revenue, 2),
            "total_cost":        round(total_cost, 2),
            "gross_profit":      round(total_profit, 2),
            "profit_margin_pct": round((total_profit / total_revenue * 100) if total_revenue > 0 else 0, 2),
        },
    }


@router.get("/reports/cogs-by-batch")
def cogs_by_batch(
    product_id: Optional[str] = None,
    date_from:  Optional[str] = None,
    date_to:    Optional[str] = None,
    db=Depends(get_db),
    _u=Depends(require_manager),
):
    """
    COGS report showing which batches contributed to each sale line.
    Returns sale_items with batch deduction details.
    """
    from routes.reports import _date_range

    filt: dict = {"batch_deductions": {"$exists": True, "$ne": []}}
    if product_id:
        filt["product_id"] = product_id
    if date_from or date_to:
        start, end = _date_range(date_from, date_to)
        filt["created_at"] = {"$gte": start, "$lte": end}

    rows = list(db[C.sale_items].find(filt).sort("created_at", -1).limit(500))
    out = []
    for r in rows:
        prod = db[C.products].find_one({"_id": r["product_id"]}, {"name": 1})
        sale = db[C.sales].find_one({"_id": r["sale_id"]}, {"invoice_no": 1, "created_at": 1})
        out.append({
            "sale_item_id":    r["_id"],
            "invoice_no":      sale["invoice_no"] if sale else None,
            "sale_date":       sale.get("created_at") if sale else r.get("created_at"),
            "product_id":      r["product_id"],
            "product_name":    prod["name"] if prod else r["product_id"],
            "quantity":        r["quantity"],
            "unit_price":      r["unit_price"],
            "unit_cost":       r.get("unit_cost", 0),
            "total_revenue":   r["total"],
            "total_cost":      round(float(r.get("unit_cost", 0)) * float(r["quantity"]), 4),
            "gross_profit":    r.get("gross_profit", 0),
            "batch_deductions": r.get("batch_deductions", []),
        })
    return out
