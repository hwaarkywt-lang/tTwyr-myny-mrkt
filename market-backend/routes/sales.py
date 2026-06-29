"""POS Sales + Shifts — MongoDB. Note: MongoDB transactions need replica set;
we use atomic per-doc updates + best-effort consistency for the in-store flow."""
from datetime import datetime, timezone, date as _date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from typing import List, Optional

from database import get_db, C
from models import new_id, MovementType, SaleStatus, ShiftStatus
from schemas.sales import (
    SaleCreate, SaleOut, SaleItemOut, ShiftOpen, ShiftClose, ShiftOut,
)
from utils.deps import get_current_user, require_cashier, require_manager, require_admin
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["sales"])

VALID_PAYMENT_METHODS = {"cash", "jaib", "fluusak", "hasib", "banki",
                          "bank_transfer", "credit", "card"}


def _generate_invoice_no(db) -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"INV-{today}-"
    count = db[C.sales].count_documents({"invoice_no": {"$regex": f"^{prefix}"}})
    return f"{prefix}{count + 1:05d}"


def _sale_to_out(s, db) -> dict:
    items_docs = list(db[C.sale_items].find({"sale_id": s["_id"]}))
    items = []
    for it in items_docs:
        p = db[C.products].find_one({"_id": it["product_id"]}, {"name": 1})
        items.append({
            "id": it["_id"], "product_id": it["product_id"],
            "product_name": p["name"] if p else None,
            "quantity": it["quantity"], "unit_price": it["unit_price"],
            "discount": it.get("discount", 0), "tax": it.get("tax", 0),
            "total": it["total"],
        })
    return SaleOut.model_validate({
        "id": s["_id"], "invoice_no": s["invoice_no"],
        "cashier_id": s["cashier_id"], "customer_id": s.get("customer_id"),
        "subtotal": s.get("subtotal", 0), "discount_amount": s.get("discount_amount", 0),
        "tax_amount": s.get("tax_amount", 0), "total": s["total"],
        "paid_amount": s.get("paid_amount", 0), "change_amount": s.get("change_amount", 0),
        "payment_method": s.get("payment_method"), "status": s.get("status", "completed"),
        "items": [SaleItemOut.model_validate(i) for i in items],
        "created_at": s["created_at"],
    })


@router.post("/sales", response_model=SaleOut, status_code=201)
def create_sale(payload: SaleCreate, request: Request,
                db = Depends(get_db), current = Depends(require_cashier)):
    if payload.payment_method not in VALID_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Invalid payment method")
    if payload.payment_method == "credit" and not payload.customer_id:
        raise HTTPException(status_code=400, detail="آجل يتطلب اختيار عميل")

    # Fetch all products
    product_ids = [it.product_id for it in payload.items]
    products = list(db[C.products].find({
        "_id": {"$in": product_ids}, "deleted_at": None,
    }))
    prod_map = {p["_id"]: p for p in products}
    if len(prod_map) != len(set(product_ids)):
        raise HTTPException(status_code=400, detail="One or more products not found")

    today = _date.today()
    for it in payload.items:
        p = prod_map[it.product_id]
        if float(p.get("current_stock", 0)) < float(it.quantity) and \
                current.role not in ("admin", "manager"):
            raise HTTPException(status_code=400,
                                detail=f"المخزون غير كافٍ لـ '{p['name']}' (المتوفر: {p.get('current_stock')}, المطلوب: {it.quantity})")
        ed = p.get("expiry_date")
        if ed:
            ed_d = ed.date() if hasattr(ed, "date") else ed
            if ed_d < today:
                raise HTTPException(status_code=400,
                                    detail=f"المنتج '{p['name']}' منتهي الصلاحية ({ed_d.isoformat()}) — لا يمكن بيعه")
        if p.get("has_expiry") and not p.get("expiry_date"):
            raise HTTPException(status_code=400,
                                detail=f"المنتج '{p['name']}' يفتقر إلى تاريخ صلاحية — لا يمكن بيعه")

    now = datetime.now(timezone.utc)
    invoice_no = _generate_invoice_no(db)
    sale_id = new_id()

    subtotal = Decimal("0")
    item_docs = []
    for it in payload.items:
        line_total = Decimal(str(it.quantity)) * Decimal(str(it.unit_price))
        subtotal += line_total
        item_docs.append({
            "_id": new_id(), "sale_id": sale_id,
            "product_id": it.product_id,
            "quantity": float(it.quantity), "unit_price": float(it.unit_price),
            "discount": 0.0, "tax": 0.0, "total": float(line_total),
            "created_at": now,
        })

    total = subtotal
    if payload.payment_method == "credit":
        paid_amount = Decimal("0")
        change_amount = Decimal("0")
        # update customer balance atomically
        r = db[C.customers].update_one(
            {"_id": payload.customer_id},
            {"$inc": {"balance": float(total)}, "$set": {"updated_at": now}},
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="العميل غير موجود")
    else:
        paid_amount = total
        change_amount = Decimal("0")

    sale_doc = {
        "_id": sale_id, "invoice_no": invoice_no,
        "shift_id": payload.shift_id, "cashier_id": current["_id"],
        "customer_id": payload.customer_id,
        "subtotal": float(subtotal), "discount_amount": 0.0, "tax_amount": 0.0,
        "total": float(total), "paid_amount": float(paid_amount),
        "change_amount": float(change_amount),
        "payment_method": payload.payment_method,
        "status": SaleStatus.completed.value,
        "notes": payload.notes,
        "created_at": now, "updated_at": now, "deleted_at": None,
    }
    db[C.sales].insert_one(sale_doc)
    db[C.sale_items].insert_many(item_docs)

    # Decrement product stock + inventory movements
    for it in payload.items:
        db[C.products].update_one({"_id": it.product_id},
                                  {"$inc": {"current_stock": -float(it.quantity)},
                                   "$set": {"updated_at": now}})
        db[C.inventory_movements].insert_one({
            "_id": new_id(), "product_id": it.product_id,
            "movement_type": MovementType.sale.value,
            "quantity": -float(it.quantity),
            "reference_table": "sales", "reference_id": sale_id,
            "user_id": current["_id"], "notes": f"Sale {invoice_no}",
            "created_at": now,
        })

    if payload.payment_method != "credit":
        db[C.sale_payments].insert_one({
            "_id": new_id(), "sale_id": sale_id,
            "method": payload.payment_method,
            "amount": float(total), "created_at": now,
        })

    log_action(db, current["_id"], "sale_created", "sales", sale_id,
               after={"invoice_no": invoice_no, "total": str(total),
                      "payment_method": payload.payment_method,
                      "customer_id": payload.customer_id}, request=request)

    s = db[C.sales].find_one({"_id": sale_id})
    return _sale_to_out(s, db)


@router.get("/sales", response_model=List[SaleOut])
def list_sales(date_from: Optional[str] = None, date_to: Optional[str] = None,
               cashier_id: Optional[str] = None, limit: int = Query(100, le=500),
               db = Depends(get_db), current = Depends(get_current_user)):
    filt = {"deleted_at": None}
    if current.role == "cashier":
        filt["cashier_id"] = current["_id"]
    elif cashier_id:
        filt["cashier_id"] = cashier_id
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = datetime.fromisoformat(date_from.replace("Z", "+00:00")) \
                if "T" in date_from else datetime.combine(_date.fromisoformat(date_from), datetime.min.time())
        if date_to:
            rng["$lte"] = datetime.fromisoformat(date_to.replace("Z", "+00:00")) \
                if "T" in date_to else datetime.combine(_date.fromisoformat(date_to), datetime.max.time())
        filt["created_at"] = rng
    rows = list(db[C.sales].find(filt).sort("created_at", -1).limit(limit))
    return [_sale_to_out(s, db) for s in rows]


@router.get("/sales/{sale_id}", response_model=SaleOut)
def get_sale(sale_id: str, db = Depends(get_db), current = Depends(get_current_user)):
    s = db[C.sales].find_one({"_id": sale_id, "deleted_at": None})
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    if current.role == "cashier" and s["cashier_id"] != current["_id"]:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية مشاهدة هذه الفاتورة")
    return _sale_to_out(s, db)


@router.post("/sales/{sale_id}/void", status_code=200)
def void_sale(sale_id: str, request: Request, db = Depends(get_db),
              current = Depends(require_admin)):
    s = db[C.sales].find_one({"_id": sale_id, "deleted_at": None})
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    if s["status"] == SaleStatus.voided.value:
        raise HTTPException(status_code=400, detail="Sale already voided")

    now = datetime.now(timezone.utc)
    items = list(db[C.sale_items].find({"sale_id": sale_id}))
    for it in items:
        db[C.products].update_one({"_id": it["product_id"]},
                                  {"$inc": {"current_stock": float(it["quantity"])},
                                   "$set": {"updated_at": now}})
        db[C.inventory_movements].insert_one({
            "_id": new_id(), "product_id": it["product_id"],
            "movement_type": MovementType.return_in.value,
            "quantity": float(it["quantity"]),
            "reference_table": "sales", "reference_id": sale_id,
            "user_id": current["_id"], "notes": f"Void {s['invoice_no']}",
            "created_at": now,
        })

    if s.get("payment_method") == "credit" and s.get("customer_id"):
        db[C.customers].update_one({"_id": s["customer_id"]},
                                   {"$inc": {"balance": -float(s["total"])}})

    db[C.sales].update_one({"_id": sale_id},
                           {"$set": {"status": SaleStatus.voided.value, "updated_at": now}})
    log_action(db, current["_id"], "sale_voided", "sales", sale_id, request=request)
    return {"detail": "Sale voided", "invoice_no": s["invoice_no"]}


# ─── Shifts ───
def _shift_out(s) -> dict:
    return {
        "id": s["_id"], "cashier_id": s["cashier_id"],
        "opened_at": s.get("opened_at"), "closed_at": s.get("closed_at"),
        "opening_cash": s.get("opening_cash", 0), "closing_cash": s.get("closing_cash"),
        "expected_cash": s.get("expected_cash"), "variance": s.get("variance"),
        "status": s.get("status", "open"), "notes": s.get("notes"),
    }


@router.post("/shifts/open", response_model=ShiftOut)
def open_shift(payload: ShiftOpen, request: Request, db = Depends(get_db),
               current = Depends(require_cashier)):
    if db[C.shifts].find_one({"cashier_id": current["_id"], "status": ShiftStatus.open.value}):
        raise HTTPException(status_code=400, detail="لديك وردية مفتوحة بالفعل")
    sid = new_id()
    now = datetime.now(timezone.utc)
    db[C.shifts].insert_one({
        "_id": sid, "cashier_id": current["_id"], "opened_at": now,
        "opening_cash": float(payload.opening_cash), "closing_cash": None,
        "expected_cash": None, "variance": None,
        "status": ShiftStatus.open.value, "notes": payload.notes,
        "created_at": now, "updated_at": now,
    })
    log_action(db, current["_id"], "shift_opened", "shifts", sid, request=request)
    s = db[C.shifts].find_one({"_id": sid})
    return ShiftOut.model_validate(_shift_out(s))


@router.post("/shifts/{shift_id}/close", response_model=ShiftOut)
def close_shift(shift_id: str, payload: ShiftClose, request: Request,
                db = Depends(get_db), current = Depends(require_cashier)):
    s = db[C.shifts].find_one({"_id": shift_id, "cashier_id": current["_id"]})
    if not s:
        raise HTTPException(status_code=404, detail="Shift not found")
    if s["status"] != ShiftStatus.open.value:
        raise HTTPException(status_code=400, detail="الوردية ليست مفتوحة")
    # Aggregate cash sales for this shift
    pipeline = [
        {"$match": {"shift_id": shift_id, "payment_method": "cash",
                    "status": SaleStatus.completed.value}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]
    agg = list(db[C.sales].aggregate(pipeline))
    cash_total = agg[0]["total"] if agg else 0.0
    expected = float(s.get("opening_cash", 0)) + float(cash_total)
    variance = float(payload.closing_cash) - expected
    now = datetime.now(timezone.utc)
    db[C.shifts].update_one({"_id": shift_id}, {"$set": {
        "closing_cash": float(payload.closing_cash),
        "expected_cash": expected, "variance": variance,
        "closed_at": now, "status": ShiftStatus.closed.value,
        "notes": (s.get("notes") or "") + ("\n" + payload.notes if payload.notes else ""),
        "updated_at": now,
    }})
    log_action(db, current["_id"], "shift_closed", "shifts", shift_id,
               after={"variance": str(variance)}, request=request)
    s = db[C.shifts].find_one({"_id": shift_id})
    return ShiftOut.model_validate(_shift_out(s))


@router.get("/shifts/current", response_model=Optional[ShiftOut])
def current_shift(db = Depends(get_db), current = Depends(require_cashier)):
    s = db[C.shifts].find_one({"cashier_id": current["_id"], "status": ShiftStatus.open.value})
    return ShiftOut.model_validate(_shift_out(s)) if s else None


@router.get("/shifts", response_model=List[ShiftOut])
def list_shifts(db = Depends(get_db), _u = Depends(require_manager)):
    rows = list(db[C.shifts].find({}).sort("opened_at", -1).limit(100))
    return [ShiftOut.model_validate(_shift_out(s)) for s in rows]
