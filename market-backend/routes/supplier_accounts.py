"""Supplier accounts, purchases, payments, and returns. MongoDB."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional

from database import get_db, C
from models import new_id, MovementType
from utils.deps import get_current_user, require_manager
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["supplier-accounts"])


# ─── Helpers ────────────────────────────────────────────────────────────────

def _user_name(db, user_id: str) -> Optional[str]:
    if not user_id:
        return None
    u = db[C.users].find_one({"_id": user_id}, {"username": 1, "full_name": 1})
    if not u:
        return None
    return u.get("full_name") or u.get("username")


# ─── Supplier statement + sub-lists ─────────────────────────────────────────

@router.get("/suppliers/{supplier_id}/statement")
def supplier_statement(supplier_id: str, db=Depends(get_db), _u=Depends(require_manager)):
    s = db[C.suppliers].find_one({"_id": supplier_id, "deleted_at": None})
    if not s:
        raise HTTPException(404, "Supplier not found")

    entries = []

    # فاتورة توريد → دائن في حساب المورد (الشركة مدينة للمورد)
    for p in db[C.purchases].find({"supplier_id": supplier_id, "deleted_at": None}).sort("created_at", 1):
        entries.append({
            "type": "purchase", "date": p.get("created_at"),
            "op_no": p.get("ref_no") or p.get("invoice_no") or p["_id"],
            "debit": 0.0, "credit": float(p.get("total", 0)),
        })

    # سند صرف → مدين في حساب المورد (تخفيض الدين على المورد)
    for p in db[C.supplier_payments].find({"supplier_id": supplier_id}).sort("created_at", 1):
        entries.append({
            "type": "payment", "date": p.get("created_at"),
            "op_no": p.get("voucher_no") or p["_id"],
            "debit": float(p.get("amount", 0)), "credit": 0.0,
        })

    # مرتجع للتاجر → مدين في حساب المورد (المورد يُلزَم برد المبلغ)
    for r in db[C.supplier_returns].find({"supplier_id": supplier_id}).sort("created_at", 1):
        entries.append({
            "type": "return", "date": r.get("created_at"),
            "op_no": r.get("voucher_no") or r["_id"],
            "debit": float(r.get("total", 0)), "credit": 0.0,
        })

    entries.sort(key=lambda e: e["date"] or datetime.min.replace(tzinfo=timezone.utc))

    # الرصيد = مدين - دائن
    # موجب → المورد مدين للشركة (دفعنا أكثر من الفواتير)
    # سالب → الشركة مدينة للمورد (فواتير أكثر من المدفوع)
    balance = 0.0
    for e in entries:
        balance += e["debit"] - e["credit"]
        e["balance"] = balance

    return {
        "opening_balance": 0,
        "closing_balance": balance,
        "entries": entries,
    }


@router.get("/suppliers/{supplier_id}/purchases")
def supplier_purchases(supplier_id: str, db=Depends(get_db), _u=Depends(require_manager)):
    rows = list(db[C.purchases].find({"supplier_id": supplier_id, "deleted_at": None}).sort("created_at", -1).limit(200))
    out = []
    for p in rows:
        items_count = db[C.purchase_items].count_documents({"purchase_id": p["_id"]})
        out.append({
            "id": p["_id"],
            "ref_no": p.get("ref_no") or p.get("invoice_no"),
            "items_count": items_count,
            "total": p.get("total", 0),
            "payment_method": p.get("payment_method"),
            "created_at": p.get("created_at"),
        })
    return out


@router.get("/suppliers/{supplier_id}/payments")
def supplier_payments_list(supplier_id: str, db=Depends(get_db), _u=Depends(require_manager)):
    rows = list(db[C.supplier_payments].find({"supplier_id": supplier_id}).sort("created_at", -1).limit(200))
    out = []
    for p in rows:
        out.append({
            "id": p["_id"],
            "voucher_no": p.get("voucher_no") or p["_id"],
            "amount": p.get("amount", 0),
            "payment_method": p.get("payment_method") or p.get("method", "cash"),
            "notes": p.get("notes"),
            "created_by_name": _user_name(db, p.get("paid_by") or p.get("created_by", "")),
            "created_at": p.get("created_at"),
        })
    return out


@router.get("/suppliers/{supplier_id}/returns")
def supplier_returns_list(supplier_id: str, db=Depends(get_db), _u=Depends(require_manager)):
    rows = list(db[C.supplier_returns].find({"supplier_id": supplier_id}).sort("created_at", -1).limit(200))
    out = []
    for r in rows:
        pur = db[C.purchases].find_one({"_id": r.get("purchase_id")})
        out.append({
            "id": r["_id"],
            "voucher_no": r.get("voucher_no"),
            "purchase_ref": (pur.get("ref_no") or pur.get("invoice_no")) if pur else None,
            "total": r.get("total", 0),
            "reason": r.get("reason"),
            "created_at": r.get("created_at"),
        })
    return out


# ─── Supplier payment POST ────────────────────────────────────────────────────

class SupPaymentIn(BaseModel):
    amount: float = Field(..., gt=0)
    payment_method: str = Field(default="cash")
    notes: Optional[str] = None


@router.post("/suppliers/{supplier_id}/payments", status_code=201)
def pay_supplier(supplier_id: str, payload: SupPaymentIn, request: Request,
                 db=Depends(get_db), current=Depends(require_manager)):
    s = db[C.suppliers].find_one({"_id": supplier_id, "deleted_at": None})
    if not s:
        raise HTTPException(404, "Supplier not found")
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y%m%d")
    count = db[C.supplier_payments].count_documents({"voucher_no": {"$regex": f"^PAY-{today}-"}})
    voucher_no = f"PAY-{today}-{count + 1:05d}"

    pid = new_id()
    db[C.supplier_payments].insert_one({
        "_id": pid, "supplier_id": supplier_id,
        "amount": float(payload.amount),
        "method": payload.payment_method,
        "payment_method": payload.payment_method,
        "voucher_no": voucher_no,
        "notes": payload.notes,
        "paid_by": current["_id"],
        "created_by": current["_id"],
        "created_at": now,
    })
    db[C.suppliers].update_one({"_id": supplier_id},
                               {"$inc": {"balance": -float(payload.amount)},
                                "$set": {"updated_at": now}})
    log_action(db, current["_id"], "supplier_paid", "supplier_payments", pid,
               after={"amount": str(payload.amount), "voucher_no": voucher_no}, request=request)
    return {
        "id": pid, "voucher_no": voucher_no,
        "amount": payload.amount,
        "payment_method": payload.payment_method,
        "notes": payload.notes,
        "created_by_name": _user_name(db, current["_id"]),
        "created_at": now,
    }


# ─── Purchases ───────────────────────────────────────────────────────────────

class PurchaseItemIn(BaseModel):
    product_id: str
    unit: str = Field(default="piece", description="piece | carton")
    quantity: Optional[float] = None
    unit_cost: Optional[float] = None
    cartons: Optional[float] = None
    pieces_per_carton: Optional[float] = None
    carton_cost: Optional[float] = None
    sale_price: Optional[float] = None


class PurchaseCreate(BaseModel):
    supplier_id: str
    payment_method: str = Field(default="credit")
    paid_amount: Optional[float] = 0
    items: List[PurchaseItemIn]
    notes: Optional[str] = None


@router.post("/purchases", status_code=201)
def create_purchase(payload: PurchaseCreate, request: Request,
                    db=Depends(get_db), current=Depends(require_manager)):
    s = db[C.suppliers].find_one({"_id": payload.supplier_id, "deleted_at": None})
    if not s:
        raise HTTPException(404, "Supplier not found")
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y%m%d")
    count = db[C.purchases].count_documents({"ref_no": {"$regex": f"^PUR-{today}-"}})
    ref_no = f"PUR-{today}-{count + 1:05d}"

    total = 0.0
    resolved_items = []
    for it in payload.items:
        if it.unit == "carton":
            cartons = float(it.cartons or 0)
            ppc = float(it.pieces_per_carton or 1)
            cc = float(it.carton_cost or 0)
            qty = cartons * ppc
            unit_cost = cc / ppc if ppc > 0 else 0.0
            line_total = cartons * cc
        else:
            qty = float(it.quantity or 0)
            unit_cost = float(it.unit_cost or 0)
            line_total = qty * unit_cost
        total += line_total
        resolved_items.append({
            "product_id": it.product_id, "unit": it.unit,
            "quantity": qty, "unit_cost": unit_cost,
            "cartons": it.cartons, "pieces_per_carton": it.pieces_per_carton,
            "carton_cost": it.carton_cost, "sale_price": it.sale_price,
            "line_total": line_total,
        })

    pur_id = new_id()
    db[C.purchases].insert_one({
        "_id": pur_id, "ref_no": ref_no, "invoice_no": ref_no,
        "supplier_id": payload.supplier_id,
        "subtotal": total, "total": total,
        "paid_amount": float(payload.paid_amount or 0),
        "payment_method": payload.payment_method,
        "notes": payload.notes, "created_by": current["_id"],
        "created_at": now, "updated_at": now, "deleted_at": None,
    })

    items_out = []
    for it in resolved_items:
        pi_id = new_id()
        db[C.purchase_items].insert_one({
            "_id": pi_id, "purchase_id": pur_id,
            "product_id": it["product_id"],
            "quantity": it["quantity"], "unit_cost": it["unit_cost"],
            "cartons": it.get("cartons"),
            "pieces_per_carton": it.get("pieces_per_carton"),
            "carton_cost": it.get("carton_cost"),
            "sale_price": it.get("sale_price"),
            "total": it["line_total"],
            "returned_quantity": 0,
        })
        upd = {"$inc": {"current_stock": it["quantity"]}, "$set": {"updated_at": now}}
        if it.get("sale_price"):
            upd["$set"]["sale_price"] = it["sale_price"]
        db[C.products].update_one({"_id": it["product_id"]}, upd)
        db[C.inventory_movements].insert_one({
            "_id": new_id(), "product_id": it["product_id"],
            "movement_type": MovementType.purchase.value,
            "quantity": it["quantity"],
            "reference_table": "purchases", "reference_id": pur_id,
            "user_id": current["_id"], "notes": f"توريد {ref_no}",
            "created_at": now,
        })
        prod = db[C.products].find_one({"_id": it["product_id"]}, {"name": 1})
        items_out.append({
            "product_name": prod["name"] if prod else it["product_id"],
            "quantity": it["quantity"], "unit_cost": it["unit_cost"],
            "total": it["line_total"],
        })

    if payload.payment_method == "credit":
        credit_amount = total - float(payload.paid_amount or 0)
        if credit_amount > 0:
            db[C.suppliers].update_one({"_id": payload.supplier_id},
                                       {"$inc": {"balance": credit_amount}})

    log_action(db, current["_id"], "purchase_created", "purchases", pur_id,
               after={"ref_no": ref_no, "total": str(total)}, request=request)
    return {
        "id": pur_id, "ref_no": ref_no,
        "total": total, "paid_amount": float(payload.paid_amount or 0),
        "payment_method": payload.payment_method, "notes": payload.notes,
        "created_by_name": _user_name(db, current["_id"]),
        "created_at": now, "items": items_out,
    }


@router.get("/purchases")
def list_purchases(supplier_id: Optional[str] = None, db=Depends(get_db),
                   _u=Depends(require_manager)):
    filt = {"deleted_at": None}
    if supplier_id:
        filt["supplier_id"] = supplier_id
    rows = list(db[C.purchases].find(filt).sort("created_at", -1).limit(200))
    out = []
    for p in rows:
        sup = db[C.suppliers].find_one({"_id": p.get("supplier_id")})
        out.append({
            "id": p["_id"],
            "ref_no": p.get("ref_no") or p.get("invoice_no"),
            "invoice_no": p.get("ref_no") or p.get("invoice_no"),
            "supplier_id": p.get("supplier_id"),
            "supplier_name": sup["name"] if sup else None,
            "total": p.get("total", 0),
            "payment_method": p.get("payment_method"),
            "created_at": p.get("created_at"),
        })
    return out


@router.get("/purchases/{purchase_id}")
def get_purchase(purchase_id: str, db=Depends(get_db), _u=Depends(require_manager)):
    p = db[C.purchases].find_one({"_id": purchase_id, "deleted_at": None})
    if not p:
        raise HTTPException(404, "Purchase not found")

    pi_rows = list(db[C.purchase_items].find({"purchase_id": purchase_id}))
    items_out = []
    for pi in pi_rows:
        prod = db[C.products].find_one({"_id": pi["product_id"]}, {"name": 1, "unit": 1})
        returned = float(pi.get("returned_quantity", 0))
        available = max(0.0, float(pi.get("quantity", 0)) - returned)
        items_out.append({
            "id": pi["_id"],
            "product_id": pi["product_id"],
            "product_name": prod["name"] if prod else pi["product_id"],
            "product_unit": prod.get("unit", "piece") if prod else "piece",
            "quantity": pi.get("quantity", 0),
            "unit_cost": pi.get("unit_cost", 0),
            "total": pi.get("total", 0),
            "returned_quantity": returned,
            "available_to_return": available,
        })

    sup = db[C.suppliers].find_one({"_id": p.get("supplier_id")}, {"name": 1})
    return {
        "id": p["_id"],
        "ref_no": p.get("ref_no") or p.get("invoice_no"),
        "supplier_id": p.get("supplier_id"),
        "supplier_name": sup["name"] if sup else None,
        "total": p.get("total", 0),
        "paid_amount": p.get("paid_amount", 0),
        "payment_method": p.get("payment_method"),
        "notes": p.get("notes"),
        "created_by_name": _user_name(db, p.get("created_by", "")),
        "created_at": p.get("created_at"),
        "items": items_out,
    }


# ─── Supplier returns ─────────────────────────────────────────────────────────

class ReturnItemIn(BaseModel):
    purchase_item_id: str
    return_unit: str = Field(default="piece")
    return_quantity: float = Field(..., gt=0)


class SupplierReturnCreate(BaseModel):
    purchase_id: str
    reason: Optional[str] = None
    items: List[ReturnItemIn]


@router.post("/supplier-returns", status_code=201)
def create_supplier_return(payload: SupplierReturnCreate, request: Request,
                           db=Depends(get_db), current=Depends(require_manager)):
    pur = db[C.purchases].find_one({"_id": payload.purchase_id, "deleted_at": None})
    if not pur:
        raise HTTPException(404, "Purchase not found")

    now = datetime.now(timezone.utc)
    today = now.strftime("%Y%m%d")
    count = db[C.supplier_returns].count_documents({"voucher_no": {"$regex": f"^RET-{today}-"}})
    voucher_no = f"RET-{today}-{count + 1:05d}"

    total = 0.0
    items_out = []
    for it in payload.items:
        pi = db[C.purchase_items].find_one({"_id": it.purchase_item_id, "purchase_id": payload.purchase_id})
        if not pi:
            raise HTTPException(404, f"Purchase item {it.purchase_item_id} not found")
        available = max(0.0, float(pi.get("quantity", 0)) - float(pi.get("returned_quantity", 0)))
        if it.return_quantity > available:
            raise HTTPException(400, f"الكمية المرتجعة تتجاوز المتاح ({available})")

        unit_cost = float(pi.get("unit_cost", 0))
        line_total = it.return_quantity * unit_cost
        total += line_total

        prod = db[C.products].find_one({"_id": pi["product_id"]}, {"name": 1})
        items_out.append({
            "purchase_item_id": it.purchase_item_id,
            "product_id": pi["product_id"],
            "product_name": prod["name"] if prod else pi["product_id"],
            "return_unit": it.return_unit,
            "quantity": it.return_quantity,
            "unit_cost": unit_cost,
            "total": line_total,
        })

        db[C.purchase_items].update_one(
            {"_id": it.purchase_item_id},
            {"$inc": {"returned_quantity": it.return_quantity}}
        )
        db[C.products].update_one(
            {"_id": pi["product_id"]},
            {"$inc": {"current_stock": -it.return_quantity}, "$set": {"updated_at": now}}
        )
        db[C.inventory_movements].insert_one({
            "_id": new_id(), "product_id": pi["product_id"],
            "movement_type": "supplier_return",
            "quantity": -it.return_quantity,
            "reference_table": "supplier_returns",
            "user_id": current["_id"],
            "notes": f"استرجاع {voucher_no}",
            "created_at": now,
        })

    ret_id = new_id()
    db[C.supplier_returns].insert_one({
        "_id": ret_id,
        "supplier_id": pur["supplier_id"],
        "purchase_id": payload.purchase_id,
        "voucher_no": voucher_no,
        "reason": payload.reason,
        "total": total,
        "items": items_out,
        "created_by": current["_id"],
        "created_at": now,
    })
    db[C.suppliers].update_one(
        {"_id": pur["supplier_id"]},
        {"$inc": {"balance": -total}, "$set": {"updated_at": now}}
    )
    log_action(db, current["_id"], "supplier_return_created", "supplier_returns", ret_id,
               after={"voucher_no": voucher_no, "total": str(total)}, request=request)

    pur_ref = pur.get("ref_no") or pur.get("invoice_no")
    return {
        "id": ret_id, "voucher_no": voucher_no, "purchase_ref": pur_ref,
        "supplier_id": pur["supplier_id"], "total": total,
        "reason": payload.reason, "items": items_out,
        "created_by_name": _user_name(db, current["_id"]),
        "created_at": now,
    }


@router.get("/supplier-returns/{return_id}")
def get_supplier_return(return_id: str, db=Depends(get_db), _u=Depends(require_manager)):
    r = db[C.supplier_returns].find_one({"_id": return_id})
    if not r:
        raise HTTPException(404, "Return not found")
    pur = db[C.purchases].find_one({"_id": r.get("purchase_id")})
    return {
        "id": r["_id"], "voucher_no": r.get("voucher_no"),
        "purchase_ref": (pur.get("ref_no") or pur.get("invoice_no")) if pur else None,
        "total": r.get("total", 0), "reason": r.get("reason"),
        "items": r.get("items", []),
        "created_by_name": _user_name(db, r.get("created_by", "")),
        "created_at": r.get("created_at"),
    }


# ─── Legacy endpoints ─────────────────────────────────────────────────────────

@router.get("/supplier-accounts")
def list_supplier_accounts(db=Depends(get_db), _u=Depends(require_manager)):
    rows = list(db[C.suppliers].find({"deleted_at": None}).sort("name", 1))
    return [{
        "id": s["_id"], "name": s["name"], "phone": s.get("phone"),
        "balance": s.get("balance", 0),
    } for s in rows]


@router.get("/supplier-accounts/{supplier_id}/statement")
def statement_legacy(supplier_id: str, db=Depends(get_db), _u=Depends(require_manager)):
    return supplier_statement(supplier_id, db, _u)


@router.post("/supplier-accounts/{supplier_id}/payments")
def pay_supplier_legacy(supplier_id: str, payload: SupPaymentIn, request: Request,
                        db=Depends(get_db), current=Depends(require_manager)):
    return pay_supplier(supplier_id, payload, request, db, current)
