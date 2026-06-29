"""Supplier accounts + purchase invoices. MongoDB."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional

from database import get_db, C
from models import new_id, MovementType
from utils.deps import get_current_user, require_manager
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["supplier-accounts"])


@router.get("/supplier-accounts")
def list_supplier_accounts(db = Depends(get_db), _u = Depends(require_manager)):
    rows = list(db[C.suppliers].find({"deleted_at": None}).sort("name", 1))
    return [{
        "id": s["_id"], "name": s["name"], "phone": s.get("phone"),
        "balance": s.get("balance", 0),
    } for s in rows]


@router.get("/supplier-accounts/{supplier_id}/statement")
def statement(supplier_id: str, db = Depends(get_db), _u = Depends(require_manager)):
    s = db[C.suppliers].find_one({"_id": supplier_id, "deleted_at": None})
    if not s:
        raise HTTPException(404, "Supplier not found")
    purchases = list(db[C.purchases].find({"supplier_id": supplier_id, "deleted_at": None}
                                           ).sort("created_at", -1).limit(200))
    payments = list(db[C.supplier_payments].find({"supplier_id": supplier_id}
                                                  ).sort("created_at", -1).limit(200))
    return {
        "supplier": {"id": s["_id"], "name": s["name"], "balance": s.get("balance", 0)},
        "purchases": [{"id": p["_id"], "invoice_no": p.get("invoice_no"),
                        "total": p.get("total", 0), "created_at": p.get("created_at")}
                       for p in purchases],
        "payments": [{"id": p["_id"], "amount": p.get("amount", 0),
                       "method": p.get("method"), "notes": p.get("notes"),
                       "created_at": p.get("created_at")} for p in payments],
    }


class PurchaseItemIn(BaseModel):
    product_id: str
    quantity: float = Field(..., gt=0)
    unit_cost: float = Field(..., ge=0)


class PurchaseCreate(BaseModel):
    supplier_id: str
    payment_method: str = Field(default="credit", description="cash | credit")
    items: List[PurchaseItemIn]
    notes: Optional[str] = None


@router.post("/purchases", status_code=201)
def create_purchase(payload: PurchaseCreate, request: Request,
                    db = Depends(get_db), current = Depends(require_manager)):
    s = db[C.suppliers].find_one({"_id": payload.supplier_id, "deleted_at": None})
    if not s:
        raise HTTPException(404, "Supplier not found")
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y%m%d")
    inv_count = db[C.purchases].count_documents({"invoice_no": {"$regex": f"^PUR-{today}-"}})
    invoice_no = f"PUR-{today}-{inv_count + 1:05d}"

    total = sum(it.quantity * it.unit_cost for it in payload.items)
    pur_id = new_id()
    db[C.purchases].insert_one({
        "_id": pur_id, "invoice_no": invoice_no,
        "supplier_id": payload.supplier_id,
        "subtotal": total, "total": total,
        "payment_method": payload.payment_method,
        "notes": payload.notes, "created_by": current["_id"],
        "created_at": now, "updated_at": now, "deleted_at": None,
    })
    for it in payload.items:
        db[C.purchase_items].insert_one({
            "_id": new_id(), "purchase_id": pur_id,
            "product_id": it.product_id, "quantity": it.quantity,
            "unit_cost": it.unit_cost, "total": it.quantity * it.unit_cost,
        })
        db[C.products].update_one({"_id": it.product_id},
                                  {"$inc": {"current_stock": it.quantity},
                                   "$set": {"updated_at": now}})
        db[C.inventory_movements].insert_one({
            "_id": new_id(), "product_id": it.product_id,
            "movement_type": MovementType.purchase.value, "quantity": it.quantity,
            "reference_table": "purchases", "reference_id": pur_id,
            "user_id": current["_id"], "notes": f"Purchase {invoice_no}",
            "created_at": now,
        })
    if payload.payment_method == "credit":
        db[C.suppliers].update_one({"_id": payload.supplier_id},
                                   {"$inc": {"balance": total}})
    log_action(db, current["_id"], "purchase_created", "purchases", pur_id,
               after={"invoice_no": invoice_no, "total": str(total)}, request=request)
    return {"id": pur_id, "invoice_no": invoice_no, "total": total}


@router.get("/purchases")
def list_purchases(supplier_id: Optional[str] = None, db = Depends(get_db),
                   _u = Depends(require_manager)):
    filt = {"deleted_at": None}
    if supplier_id:
        filt["supplier_id"] = supplier_id
    rows = list(db[C.purchases].find(filt).sort("created_at", -1).limit(200))
    out = []
    for p in rows:
        sup = db[C.suppliers].find_one({"_id": p.get("supplier_id")})
        out.append({"id": p["_id"], "invoice_no": p.get("invoice_no"),
                    "supplier_id": p.get("supplier_id"),
                    "supplier_name": sup["name"] if sup else None,
                    "total": p.get("total", 0),
                    "payment_method": p.get("payment_method"),
                    "created_at": p.get("created_at")})
    return out


class SupPaymentIn(BaseModel):
    amount: float = Field(..., gt=0)
    method: str = Field(default="cash")
    notes: Optional[str] = None


@router.post("/supplier-accounts/{supplier_id}/payments")
def pay_supplier(supplier_id: str, payload: SupPaymentIn, request: Request,
                 db = Depends(get_db), current = Depends(require_manager)):
    s = db[C.suppliers].find_one({"_id": supplier_id, "deleted_at": None})
    if not s:
        raise HTTPException(404, "Supplier not found")
    now = datetime.now(timezone.utc)
    pid = new_id()
    db[C.supplier_payments].insert_one({
        "_id": pid, "supplier_id": supplier_id, "amount": float(payload.amount),
        "method": payload.method, "notes": payload.notes,
        "paid_by": current["_id"], "created_at": now,
    })
    db[C.suppliers].update_one({"_id": supplier_id},
                               {"$inc": {"balance": -float(payload.amount)},
                                "$set": {"updated_at": now}})
    log_action(db, current["_id"], "supplier_paid", "supplier_payments", pid,
               after={"amount": str(payload.amount)}, request=request)
    return {"id": pid, "detail": "تم تسجيل الدفعة"}
