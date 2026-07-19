"""Customers + Suppliers — MongoDB."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List, Optional

from database import get_db, C
from models import new_id
from schemas.parties import (
    CustomerCreate, CustomerUpdate, CustomerOut,
    SupplierCreate, SupplierUpdate, SupplierOut,
)
from utils.deps import get_current_user, require_manager
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["parties"])


def _cust_out(c) -> dict:
    return {
        "id": c["_id"], "code": c.get("code"), "full_name": c["full_name"],
        "phone": c.get("phone"), "email": c.get("email"), "address": c.get("address"),
        "credit_limit": c.get("credit_limit", 0), "balance": c.get("balance", 0),
        "loyalty_points": c.get("loyalty_points", 0),
        "is_active": c.get("is_active", True), "created_at": c.get("created_at"),
    }


def _sup_out(s) -> dict:
    return {
        "id": s["_id"], "code": s.get("code"), "name": s["name"],
        "contact_person": s.get("contact_person"), "phone": s.get("phone"),
        "email": s.get("email"), "address": s.get("address"),
        "balance": s.get("balance", 0), "is_active": s.get("is_active", True),
        "created_at": s.get("created_at"),
    }


# ─── Customers ───
@router.get("/customers", response_model=List[CustomerOut])
def list_customers(q: Optional[str] = None, db = Depends(get_db),
                   _u = Depends(get_current_user)):
    filt = {"deleted_at": None}
    if q:
        rx = {"$regex": q, "$options": "i"}
        filt["$or"] = [{"full_name": rx}, {"phone": rx}, {"code": rx}]
    rows = list(db[C.customers].find(filt).sort("full_name", 1))
    return [CustomerOut.model_validate(_cust_out(c)) for c in rows]


@router.post("/customers", response_model=CustomerOut, status_code=201)
def create_customer(payload: CustomerCreate, request: Request,
                    db = Depends(get_db), current = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    cid = new_id()
    data = payload.model_dump()
    # Convert Decimal values to float for Mongo storage
    for k in list(data.keys()):
        if hasattr(data[k], "as_tuple"):
            data[k] = float(data[k])
    db[C.customers].insert_one({
        "_id": cid, **data,
        "loyalty_points": data.get("loyalty_points", 0),
        "balance": data.get("balance", 0),
        "is_active": True,
        "created_at": now, "updated_at": now, "deleted_at": None,
    })
    log_action(db, current["_id"], "customer_created", "customers", cid,
               after={"full_name": payload.full_name}, request=request)
    c = db[C.customers].find_one({"_id": cid})
    return CustomerOut.model_validate(_cust_out(c))


@router.get("/customers/{customer_id}")
def get_customer(customer_id: str, db = Depends(get_db), _u = Depends(get_current_user)):
    c = db[C.customers].find_one({"_id": customer_id, "deleted_at": None})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    credit_sales = list(db[C.sales].find({"customer_id": customer_id, "payment_method": "credit", "status": {"$ne": "voided"}}))
    total_credit_purchases = sum(s.get("total", 0) for s in credit_sales)
    invoice_count = len(credit_sales)
    total_paid = sum(p.get("amount", 0) for p in db[C.customer_payments].find({"customer_id": customer_id}))
    # Last activity: max of last sale or payment date
    last_sale = db[C.sales].find_one({"customer_id": customer_id}, sort=[("created_at", -1)])
    last_pay = db[C.customer_payments].find_one({"customer_id": customer_id}, sort=[("created_at", -1)])
    dates = [d.get("created_at") for d in [last_sale, last_pay] if d and d.get("created_at")]
    last_activity = max(dates) if dates else None
    return {
        "id": c["_id"], "full_name": c["full_name"], "phone": c.get("phone"),
        "email": c.get("email"), "address": c.get("address"),
        "balance": c.get("balance", 0),
        "credit_limit": c.get("credit_limit", 0),
        "loyalty_points": c.get("loyalty_points", 0),
        "total_credit_purchases": total_credit_purchases,
        "total_paid": total_paid,
        "total_returns": 0,
        "invoice_count": invoice_count,
        "last_activity_at": last_activity,
        "created_at": c.get("created_at"),
    }


@router.patch("/customers/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: str, payload: CustomerUpdate, request: Request,
                    db = Depends(get_db), current = Depends(get_current_user)):
    c = db[C.customers].find_one({"_id": customer_id, "deleted_at": None})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    data = payload.model_dump(exclude_unset=True)
    for k in list(data.keys()):
        if hasattr(data[k], "as_tuple"):
            data[k] = float(data[k])
    data["updated_at"] = datetime.now(timezone.utc)
    db[C.customers].update_one({"_id": customer_id}, {"$set": data})
    log_action(db, current["_id"], "customer_updated", "customers", customer_id, request=request)
    c = db[C.customers].find_one({"_id": customer_id})
    return CustomerOut.model_validate(_cust_out(c))


@router.delete("/customers/{customer_id}", status_code=204)
def delete_customer(customer_id: str, request: Request,
                    db = Depends(get_db), current = Depends(require_manager)):
    c = db[C.customers].find_one({"_id": customer_id, "deleted_at": None})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    now = datetime.now(timezone.utc)
    db[C.customers].update_one({"_id": customer_id}, {"$set": {
        "deleted_at": now, "is_active": False, "updated_at": now,
    }})
    log_action(db, current["_id"], "customer_deleted", "customers", customer_id, request=request)
    return None


# ─── Suppliers ───
@router.get("/suppliers", response_model=List[SupplierOut])
def list_suppliers(q: Optional[str] = None, db = Depends(get_db),
                   _u = Depends(require_manager)):
    filt = {"deleted_at": None}
    if q:
        rx = {"$regex": q, "$options": "i"}
        filt["$or"] = [{"name": rx}, {"phone": rx}, {"code": rx}]
    rows = list(db[C.suppliers].find(filt).sort("name", 1))
    return [SupplierOut.model_validate(_sup_out(s)) for s in rows]


@router.post("/suppliers", response_model=SupplierOut, status_code=201)
def create_supplier(payload: SupplierCreate, request: Request,
                    db = Depends(get_db), current = Depends(require_manager)):
    now = datetime.now(timezone.utc)
    sid = new_id()
    data = payload.model_dump()
    for k in list(data.keys()):
        if hasattr(data[k], "as_tuple"):
            data[k] = float(data[k])
    db[C.suppliers].insert_one({
        "_id": sid, **data,
        "balance": data.get("balance", 0), "is_active": True,
        "created_at": now, "updated_at": now, "deleted_at": None,
    })
    log_action(db, current["_id"], "supplier_created", "suppliers", sid,
               after={"name": payload.name}, request=request)
    s = db[C.suppliers].find_one({"_id": sid})
    return SupplierOut.model_validate(_sup_out(s))


@router.get("/suppliers/{supplier_id}")
def get_supplier(supplier_id: str, db = Depends(get_db), _u = Depends(require_manager)):
    s = db[C.suppliers].find_one({"_id": supplier_id, "deleted_at": None})
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # إجمالي جميع المشتريات (للعرض فقط)
    all_purchases = list(db[C.purchases].find({"supplier_id": supplier_id, "deleted_at": None}))
    total_purchases_all = sum(p.get("total", 0) for p in all_purchases)

    # ─── دالة مساعدة: المبلغ الفعلي المدفوع عند إنشاء الفاتورة ─────────────────
    # منطق التوافق مع البيانات القديمة:
    # • نقدي/بنكي بدون paid_amount صريح → اعتبر مسدّداً كاملاً
    # • آجل (credit) بدون paid_amount → اعتبر صفر (لم يُدفع)
    # • أي فاتورة بـ paid_amount > 0 → استخدم القيمة المخزّنة
    def _eff_paid(p):
        pm = p.get("payment_method", "credit")
        pa = float(p.get("paid_amount") or 0)
        ttl = float(p.get("total", 0))
        if pa > 0:
            return pa
        return ttl if pm != "credit" else 0.0

    # الرصيد المستحق الصحيح (يشمل جميع المشتريات بجميع طرق الدفع)
    # موجب  = نحن مدينون للتاجر (فواتير لم تُسدَّد بالكامل)
    # سالب  = دفعنا أكثر مما علينا → مستحق لنا عند التاجر
    total_credit_unpaid = sum(
        float(p.get("total", 0)) - _eff_paid(p)
        for p in all_purchases
    )
    total_paid = sum(
        p.get("amount", 0) for p in db[C.supplier_payments].find({"supplier_id": supplier_id})
    )
    total_returns = sum(
        r.get("total", 0) for r in db[C.supplier_returns].find({"supplier_id": supplier_id})
    )
    computed_balance = total_credit_unpaid - total_paid - total_returns

    return {
        "id": s["_id"], "name": s["name"], "phone": s.get("phone"),
        "email": s.get("email"), "address": s.get("address"),
        "balance": computed_balance,
        "total_purchases": total_purchases_all,
        "total_paid": total_paid,
        "total_returns": total_returns,
        "created_at": s.get("created_at"),
    }


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: str, payload: SupplierUpdate, request: Request,
                    db = Depends(get_db), current = Depends(require_manager)):
    s = db[C.suppliers].find_one({"_id": supplier_id, "deleted_at": None})
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    data = payload.model_dump(exclude_unset=True)
    for k in list(data.keys()):
        if hasattr(data[k], "as_tuple"):
            data[k] = float(data[k])
    data["updated_at"] = datetime.now(timezone.utc)
    db[C.suppliers].update_one({"_id": supplier_id}, {"$set": data})
    log_action(db, current["_id"], "supplier_updated", "suppliers", supplier_id, request=request)
    s = db[C.suppliers].find_one({"_id": supplier_id})
    return SupplierOut.model_validate(_sup_out(s))


@router.delete("/suppliers/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: str, request: Request,
                    db = Depends(get_db), current = Depends(require_manager)):
    s = db[C.suppliers].find_one({"_id": supplier_id, "deleted_at": None})
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    now = datetime.now(timezone.utc)
    db[C.suppliers].update_one({"_id": supplier_id}, {"$set": {
        "deleted_at": now, "is_active": False, "updated_at": now,
    }})
    log_action(db, current["_id"], "supplier_deleted", "suppliers", supplier_id, request=request)
    return None
