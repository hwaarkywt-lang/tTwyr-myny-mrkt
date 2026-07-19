"""Sale returns — MongoDB.

Workflow:
  - Cashier creates a PENDING return via POST /api/sales-returns
  - Manager approves via POST /api/sales-returns/{id}/approve  (stock + balance updated)
  - Manager rejects via POST /api/sales-returns/{id}/reject

Also supports:
  - Instant return (auto-approved) via POST /api/sales-returns/instant
  - Nested:  POST /api/sales/{sale_id}/returns
  - Search:  GET  /api/sales-returns/search-sales
  - Exchanges: POST /api/sales-exchanges
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional

from database import get_db, C
from models import new_id, MovementType
from utils.deps import require_cashier, require_manager
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["sales-returns"])


# ──────────────── Schemas ────────────────────────────────────────────

class ReturnItemIn(BaseModel):
    sale_item_id: str
    quantity: float = Field(..., gt=0)


class SaleReturnCreate(BaseModel):
    sale_id: str
    items: List[ReturnItemIn]
    reason: Optional[str] = None
    return_type: str = Field(default="cash", description="cash | credit")


class RejectPayload(BaseModel):
    reason: str = Field(..., min_length=3)


# ──────────────── Helpers ────────────────────────────────────────────

def _next_return_no(db) -> str:
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y%m%d")
    cnt = db[C.sale_returns].count_documents(
        {"return_no": {"$regex": f"^RET-{today}-"}}
    )
    return f"RET-{today}-{cnt + 1:05d}"


def _enrich_return(db, r: dict) -> dict:
    """Add invoice_no, customer_name, items[], creator_name to a return doc."""
    sale = db[C.sales].find_one({"_id": r.get("sale_id")}, {
        "invoice_no": 1, "customer_id": 1,
    }) or {}

    customer_name = "عميل نقدي"
    if sale.get("customer_id"):
        c = db[C.customers].find_one({"_id": sale["customer_id"]}, {"full_name": 1})
        if c:
            customer_name = c.get("full_name", customer_name)

    creator_name = "—"
    if r.get("created_by"):
        u = db[C.users].find_one({"_id": r["created_by"]}, {"full_name": 1, "username": 1})
        if u:
            creator_name = u.get("full_name") or u.get("username", "—")

    approver_name = None
    if r.get("approved_by"):
        u = db[C.users].find_one({"_id": r["approved_by"]}, {"full_name": 1, "username": 1})
        if u:
            approver_name = u.get("full_name") or u.get("username")

    # Line items
    raw_items = list(db[C.sale_return_items].find({"return_id": r["_id"]}))
    prod_ids = [i["product_id"] for i in raw_items if i.get("product_id")]
    prod_map = {p["_id"]: p for p in db[C.products].find(
        {"_id": {"$in": prod_ids}}, {"name": 1, "sku": 1}
    )} if prod_ids else {}

    items = []
    for i in raw_items:
        prod = prod_map.get(i.get("product_id"), {})
        items.append({
            "id": i["_id"],
            "product_id": i.get("product_id"),
            "product_name": prod.get("name", "—"),
            "product_sku": prod.get("sku"),
            "quantity": i.get("quantity", 0),
            "unit_price": i.get("unit_price", 0),
            "refund_amount": i.get("total", 0),
        })

    return {
        "id": r["_id"],
        "return_no": r.get("return_no"),
        "sale_id": r.get("sale_id"),
        "invoice_no": sale.get("invoice_no"),
        "customer_name": customer_name,
        "total": r.get("total", 0),
        "status": r.get("status"),
        "reason": r.get("reason"),
        "rejection_reason": r.get("rejection_reason"),
        "return_type": r.get("return_type"),
        "items": items,
        "creator_name": creator_name,
        "approver_name": approver_name,
        "created_at": r.get("created_at"),
        "approved_at": r.get("approved_at"),
    }


def _already_returned_qty(db, sale_item_id: str) -> float:
    """Sum quantity already returned (approved or pending) for a given sale item."""
    agg = list(db[C.sale_return_items].aggregate([
        {"$match": {"sale_item_id": sale_item_id}},
        # Only count items whose parent return is not rejected/canceled
        {"$lookup": {
            "from": C.sale_returns,
            "localField": "return_id",
            "foreignField": "_id",
            "as": "ret",
        }},
        {"$unwind": "$ret"},
        {"$match": {"ret.status": {"$in": ["pending", "approved"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$quantity"}}},
    ]))
    return float(agg[0]["total"]) if agg else 0.0


def _apply_return_stock(db, return_id: str, current_user_id: str):
    """Restore stock for all items in a return (called on approval)."""
    items = list(db[C.sale_return_items].find({"return_id": return_id}))
    now = datetime.now(timezone.utc)
    for it in items:
        db[C.products].update_one(
            {"_id": it["product_id"]},
            {"$inc": {"current_stock": it["quantity"]}, "$set": {"updated_at": now}},
        )
        db[C.inventory_movements].insert_one({
            "_id": new_id(),
            "product_id": it["product_id"],
            "movement_type": MovementType.return_in.value,
            "quantity": it["quantity"],
            "reference_table": "sale_returns",
            "reference_id": return_id,
            "user_id": current_user_id,
            "notes": f"Return approved",
            "created_at": now,
        })


# ──────────────── POST /api/sales-returns  (creates PENDING) ─────────

@router.post("/sales-returns", status_code=201)
def create_pending_return(
    payload: SaleReturnCreate,
    db=Depends(get_db),
    current=Depends(require_cashier),
):
    """Create a pending return (requires manager approval)."""
    sale = db[C.sales].find_one({"_id": payload.sale_id, "deleted_at": None})
    if not sale:
        raise HTTPException(404, "الفاتورة غير موجودة")

    now = datetime.now(timezone.utc)
    return_no = _next_return_no(db)
    rid = new_id()
    subtotal = 0.0

    for it in payload.items:
        si = db[C.sale_items].find_one(
            {"_id": it.sale_item_id, "sale_id": payload.sale_id}
        )
        if not si:
            raise HTTPException(400, f"بند الفاتورة {it.sale_item_id} غير موجود")
        sold_qty = float(si["quantity"])
        already = _already_returned_qty(db, it.sale_item_id)
        if it.quantity > (sold_qty - already):
            raise HTTPException(
                400,
                f"كمية المرتجع ({it.quantity}) تتجاوز الكمية المتاحة للإرجاع ({sold_qty - already:.2f})"
            )

        line_total = it.quantity * float(si["unit_price"])
        subtotal += line_total

        db[C.sale_return_items].insert_one({
            "_id": new_id(),
            "return_id": rid,
            "sale_item_id": it.sale_item_id,
            "product_id": si["product_id"],
            "quantity": it.quantity,
            "unit_price": float(si["unit_price"]),
            "total": line_total,
        })

    db[C.sale_returns].insert_one({
        "_id": rid,
        "return_no": return_no,
        "sale_id": payload.sale_id,
        "customer_id": sale.get("customer_id"),
        "subtotal": subtotal,
        "total": subtotal,
        "reason": payload.reason,
        "return_type": payload.return_type,
        "status": "pending",       # ← awaits manager approval
        "created_by": current["_id"],
        "approved_by": None,
        "approved_at": None,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    })

    log_action(db, current["_id"], "sale_return_created", "sale_returns", rid,
               after={"return_no": return_no, "total": str(subtotal), "status": "pending"})

    return {"id": rid, "return_no": return_no, "total": subtotal, "status": "pending"}


# ──────────────── POST /api/sales-returns/instant (auto-approved) ────

@router.post("/sales-returns/instant", status_code=201)
def instant_return(
    payload: SaleReturnCreate,
    db=Depends(get_db),
    current=Depends(require_cashier),
):
    """Instant return — immediately approved (used from POS screen)."""
    sale = db[C.sales].find_one({"_id": payload.sale_id, "deleted_at": None})
    if not sale:
        raise HTTPException(404, "الفاتورة غير موجودة")

    now = datetime.now(timezone.utc)
    return_no = _next_return_no(db)
    rid = new_id()
    subtotal = 0.0

    for it in payload.items:
        si = db[C.sale_items].find_one(
            {"_id": it.sale_item_id, "sale_id": payload.sale_id}
        )
        if not si:
            raise HTTPException(400, f"بند الفاتورة {it.sale_item_id} غير موجود")
        sold_qty = float(si["quantity"])
        already = _already_returned_qty(db, it.sale_item_id)
        if it.quantity > (sold_qty - already):
            raise HTTPException(
                400,
                f"كمية المرتجع ({it.quantity}) تتجاوز الكمية المتاحة للإرجاع ({sold_qty - already:.2f})"
            )

        line_total = it.quantity * float(si["unit_price"])
        subtotal += line_total

        db[C.sale_return_items].insert_one({
            "_id": new_id(),
            "return_id": rid,
            "sale_item_id": it.sale_item_id,
            "product_id": si["product_id"],
            "quantity": it.quantity,
            "unit_price": float(si["unit_price"]),
            "total": line_total,
        })

    db[C.sale_returns].insert_one({
        "_id": rid,
        "return_no": return_no,
        "sale_id": payload.sale_id,
        "customer_id": sale.get("customer_id"),
        "subtotal": subtotal,
        "total": subtotal,
        "reason": payload.reason,
        "return_type": payload.return_type,
        "status": "approved",
        "created_by": current["_id"],
        "approved_by": current["_id"],
        "approved_at": now,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    })

    # Restore stock immediately
    _apply_return_stock(db, rid, current["_id"])

    log_action(db, current["_id"], "sale_return_instant", "sale_returns", rid,
               after={"return_no": return_no, "total": str(subtotal)})

    return {"id": rid, "return_no": return_no, "total": subtotal, "status": "approved"}


# ──────────────── GET /api/sales-returns ─────────────────────────────

@router.get("/sales-returns")
def list_returns(
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
    db=Depends(get_db),
    _u=Depends(require_cashier),
):
    filt: dict = {"deleted_at": None}
    if status:
        filt["status"] = status
    rows = list(
        db[C.sale_returns].find(filt).sort("created_at", -1).limit(limit)
    )
    return [_enrich_return(db, r) for r in rows]


# ──────────────── GET /api/sales/{sale_id}/returns ───────────────────

@router.get("/sales/{sale_id}/returns")
def list_returns_for_sale(
    sale_id: str,
    db=Depends(get_db),
    _u=Depends(require_cashier),
):
    rows = list(
        db[C.sale_returns].find({"sale_id": sale_id, "deleted_at": None}).sort("created_at", -1)
    )
    return [_enrich_return(db, r) for r in rows]


# ──────────────── POST /api/sales/{sale_id}/returns ──────────────────

@router.post("/sales/{sale_id}/returns", status_code=201)
def create_return_nested(
    sale_id: str,
    payload: SaleReturnCreate,
    db=Depends(get_db),
    current=Depends(require_cashier),
):
    payload.sale_id = sale_id
    return create_pending_return(payload, db, current)


# ──────────────── POST /api/sales-returns/{id}/approve ───────────────

@router.post("/sales-returns/{return_id}/approve", status_code=200)
def approve_return(
    return_id: str,
    db=Depends(get_db),
    current=Depends(require_manager),
):
    now = datetime.now(timezone.utc)
    # Atomic conditional update — only transitions from "pending" to "approved"
    result = db[C.sale_returns].update_one(
        {"_id": return_id, "status": "pending"},
        {"$set": {
            "status": "approved",
            "approved_by": current["_id"],
            "approved_at": now,
            "updated_at": now,
        }},
    )
    if result.matched_count == 0:
        # Either doesn't exist or already processed — check which
        ret = db[C.sale_returns].find_one({"_id": return_id})
        if not ret:
            raise HTTPException(404, "المرتجع غير موجود")
        raise HTTPException(409, f"لا يمكن اعتماد مرتجع بحالة: {ret.get('status')}")

    ret = db[C.sale_returns].find_one({"_id": return_id})

    # Restore stock and create inventory movements
    _apply_return_stock(db, return_id, current["_id"])

    # If credit return → reduce customer balance
    if ret.get("return_type") == "credit" and ret.get("customer_id"):
        db[C.customers].update_one(
            {"_id": ret["customer_id"]},
            {"$inc": {"balance": -float(ret.get("total", 0))},
             "$set": {"updated_at": now}},
        )

    log_action(db, current["_id"], "sale_return_approved", "sale_returns", return_id)

    return {"id": return_id, "status": "approved"}


# ──────────────── POST /api/sales-returns/{id}/reject ────────────────

@router.post("/sales-returns/{return_id}/reject", status_code=200)
def reject_return(
    return_id: str,
    payload: RejectPayload,
    db=Depends(get_db),
    current=Depends(require_manager),
):
    now = datetime.now(timezone.utc)
    # Atomic conditional update — only transitions from "pending" to "rejected"
    result = db[C.sale_returns].update_one(
        {"_id": return_id, "status": "pending"},
        {"$set": {
            "status": "rejected",
            "rejection_reason": payload.reason,
            "approved_by": current["_id"],
            "approved_at": now,
            "updated_at": now,
        }},
    )
    if result.matched_count == 0:
        ret = db[C.sale_returns].find_one({"_id": return_id})
        if not ret:
            raise HTTPException(404, "المرتجع غير موجود")
        raise HTTPException(409, f"لا يمكن رفض مرتجع بحالة: {ret.get('status')}")

    # Delete the pending return items (no stock change)
    db[C.sale_return_items].delete_many({"return_id": return_id})

    log_action(db, current["_id"], "sale_return_rejected", "sale_returns", return_id,
               after={"reason": payload.reason})

    return {"id": return_id, "status": "rejected"}


# ──────────────── GET /api/sales-returns/search-sales ────────────────

@router.get("/sales-returns/search-sales")
def search_sales_for_return(
    q: Optional[str] = None,
    limit: int = Query(50, le=200),
    db=Depends(get_db),
    _u=Depends(require_cashier),
):
    """Find completed sales by invoice_no or customer name/phone for the return UI."""
    filt: dict = {"deleted_at": None, "status": "completed"}

    customer_ids: Optional[List[str]] = None
    if q:
        # Try to match customers by name or phone first
        cust_rows = list(db[C.customers].find(
            {"$or": [
                {"full_name": {"$regex": q, "$options": "i"}},
                {"phone": {"$regex": q, "$options": "i"}},
            ]},
            {"_id": 1},
        ))
        customer_ids = [c["_id"] for c in cust_rows]

        if customer_ids:
            # Match by invoice_no OR customer_id
            filt["$or"] = [
                {"invoice_no": {"$regex": q, "$options": "i"}},
                {"customer_id": {"$in": customer_ids}},
            ]
        else:
            filt["invoice_no"] = {"$regex": q, "$options": "i"}

    rows = list(db[C.sales].find(filt).sort("created_at", -1).limit(limit))

    # Enrich with customer name
    cust_map: dict = {}
    cust_ids_needed = list({s["customer_id"] for s in rows if s.get("customer_id")})
    if cust_ids_needed:
        for c in db[C.customers].find({"_id": {"$in": cust_ids_needed}}, {"full_name": 1, "phone": 1}):
            cust_map[c["_id"]] = c

    out = []
    for s in rows:
        cust = cust_map.get(s.get("customer_id"))
        out.append({
            "id": s["_id"],
            "sale_id": s["_id"],
            "invoice_no": s.get("invoice_no"),
            "total": s.get("total", 0),
            "payment_method": s.get("payment_method"),
            "customer_id": s.get("customer_id"),
            "customer_name": cust.get("full_name") if cust else None,
            "customer_phone": cust.get("phone") if cust else None,
            "created_at": s.get("created_at"),
        })
    return out


# ──────────────── POST /api/sales-exchanges ──────────────────────────

class ExchangeReturnItemIn(BaseModel):
    sale_item_id: str
    quantity: float = Field(..., gt=0)


class ExchangeNewItemIn(BaseModel):
    product_id: str
    quantity: float = Field(..., gt=0)


class ExchangePayloadV2(BaseModel):
    sale_id: str
    return_items: List[ExchangeReturnItemIn]
    new_items: List[ExchangeNewItemIn]
    settlement: str = Field(default="cash")   # cash | cash_refund | credit
    reason: Optional[str] = None


@router.post("/sales-exchanges", status_code=201)
def create_exchange(
    payload: ExchangePayloadV2,
    db=Depends(get_db),
    current=Depends(require_cashier),
):
    """Exchange = instant return + new sale for replacement items."""
    from decimal import Decimal as D

    # ── 1. Instant return for the returned items ──────────────────────
    return_payload = SaleReturnCreate(
        sale_id=payload.sale_id,
        items=[ReturnItemIn(sale_item_id=it.sale_item_id, quantity=it.quantity)
               for it in payload.return_items],
        reason=payload.reason or "استبدال POS",
        return_type="cash",
    )
    ret_result = instant_return(return_payload, db, current)
    return_value = float(ret_result["total"])

    # ── 2. Build new sale for the exchange items ──────────────────────
    now = datetime.now(timezone.utc)
    new_total = D("0")
    new_item_docs = []
    new_sale_id = new_id()

    # Get original sale's customer
    orig_sale = db[C.sales].find_one({"_id": payload.sale_id})
    customer_id = orig_sale.get("customer_id") if orig_sale else None

    for it in payload.new_items:
        prod = db[C.products].find_one({"_id": it.product_id, "deleted_at": None})
        if not prod:
            raise HTTPException(404, f"منتج {it.product_id} غير موجود")
        sale_price = D(str(prod.get("sale_price", 0)))
        qty = D(str(it.quantity))
        line_total = sale_price * qty
        new_total += line_total
        new_item_docs.append({
            "_id": new_id(), "sale_id": new_sale_id,
            "product_id": it.product_id,
            "quantity": float(qty), "unit_price": float(sale_price),
            "discount": 0.0, "tax": 0.0, "total": float(line_total),
            "created_at": now,
        })

    new_total_f = float(new_total)
    diff = round(new_total_f - return_value, 4)

    # Determine payment_method for the new sale
    if diff > 0:
        new_pm = "cash"            # customer pays extra in cash
    elif diff < 0 and payload.settlement == "credit" and customer_id:
        new_pm = "credit"          # credit customer for excess return value
    else:
        new_pm = "cash"            # no difference or cash_refund

    # Generate invoice no
    today = now.strftime("%Y%m%d")
    inv_count = db[C.sales].count_documents({"invoice_no": {"$regex": f"^INV-{today}-"}})
    new_invoice_no = f"INV-{today}-{inv_count + 1:05d}"

    # Insert new sale
    if new_item_docs:
        db[C.sales].insert_one({
            "_id": new_sale_id, "invoice_no": new_invoice_no,
            "shift_id": None, "cashier_id": current["_id"],
            "customer_id": customer_id if new_pm == "credit" else None,
            "subtotal": new_total_f, "discount_amount": 0.0, "tax_amount": 0.0,
            "total": new_total_f,
            "paid_amount": new_total_f if new_pm != "credit" else 0.0,
            "change_amount": 0.0,
            "payment_method": new_pm,
            "status": "completed",
            "notes": f"استبدال من {orig_sale.get('invoice_no', '')}",
            "created_at": now, "updated_at": now, "deleted_at": None,
        })
        db[C.sale_items].insert_many(new_item_docs)

        # Deduct stock + inventory movements
        for it in payload.new_items:
            db[C.products].update_one({"_id": it.product_id},
                {"$inc": {"current_stock": -float(it.quantity)}, "$set": {"updated_at": now}})
            db[C.inventory_movements].insert_one({
                "_id": new_id(), "product_id": it.product_id,
                "movement_type": "sale",
                "quantity": -float(it.quantity),
                "reference_table": "sales", "reference_id": new_sale_id,
                "user_id": current["_id"],
                "notes": f"استبدال {new_invoice_no}",
                "created_at": now,
            })

        # If credit settlement (diff < 0 and credit mode) → decrease customer balance
        if new_pm == "credit" and customer_id and diff > 0:
            db[C.customers].update_one(
                {"_id": customer_id},
                {"$inc": {"balance": new_total_f}, "$set": {"updated_at": now}},
            )
        elif payload.settlement == "credit" and customer_id and diff < 0:
            # Store owes customer; credit their account (reduce their debt)
            db[C.customers].update_one(
                {"_id": customer_id},
                {"$inc": {"balance": diff}, "$set": {"updated_at": now}},
            )

    # ── 3. Build response ─────────────────────────────────────────────
    if diff > 0:
        msg = f"العميل يدفع فرق {abs(diff):.2f} ر.ي نقداً"
    elif diff < 0:
        if payload.settlement == "credit" and customer_id:
            msg = f"تم إضافة {abs(diff):.2f} ر.ي كرصيد دائن للعميل"
        else:
            msg = f"المحل يرد {abs(diff):.2f} ر.ي نقداً للعميل"
    else:
        msg = "استبدال بدون فرق سعر"

    return {
        "return": ret_result,
        "new_invoice_no": new_invoice_no if new_item_docs else None,
        "return_value": return_value,
        "new_total": new_total_f,
        "diff": diff,
        "settlement": payload.settlement,
        "message": msg,
    }


# ──────────────── GET /api/supplier-returns ──────────────────────────

@router.get("/supplier-returns")
def list_supplier_returns(
    db=Depends(get_db),
    _u=Depends(require_cashier),
):
    rows = list(
        db[C.supplier_returns].find({"deleted_at": None}).sort("created_at", -1).limit(100)
    )
    return [{
        "id": r["_id"],
        "return_no": r.get("return_no"),
        "supplier_id": r.get("supplier_id"),
        "total": r.get("total", 0),
        "created_at": r.get("created_at"),
    } for r in rows]
