"""Customer accounts: statement, payments, and detail endpoints. MongoDB."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from typing import List, Optional

from database import get_db, C
from models import new_id
from utils.deps import get_current_user, require_manager
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["customer-accounts"])


# ─── Helpers ────────────────────────────────────────────────────────────────

def _user_name(db, user_id: str) -> Optional[str]:
    if not user_id:
        return None
    u = db[C.users].find_one({"_id": user_id}, {"username": 1, "full_name": 1})
    if not u:
        return None
    return u.get("full_name") or u.get("username")


# ─── Customer statement ───────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/statement")
def customer_statement(
    customer_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db=Depends(get_db),
    _u=Depends(get_current_user),
):
    c = db[C.customers].find_one({"_id": customer_id, "deleted_at": None})
    if not c:
        raise HTTPException(404, "Customer not found")

    # Parse date range
    dt_from = datetime.fromisoformat(date_from) if date_from else None
    dt_to = datetime.fromisoformat(date_to) if date_to else None

    entries = []

    # Credit sales
    sale_filt = {"customer_id": customer_id, "payment_method": "credit", "status": {"$ne": "voided"}}
    if dt_from:
        sale_filt["created_at"] = {"$gte": dt_from}
    if dt_to:
        sale_filt.setdefault("created_at", {})["$lte"] = dt_to
    for s in db[C.sales].find(sale_filt).sort("created_at", 1):
        entries.append({
            "type": "sale",
            "date": s.get("created_at"),
            "op_no": s.get("invoice_no") or s.get("sale_number") or s["_id"],
            "description": "فاتورة آجل",
            "debit": float(s.get("total", 0)),
            "credit": 0.0,
            "ref_id": s["_id"],
            "voided": s.get("status") == "voided",
        })

    # Customer payments
    pay_filt = {"customer_id": customer_id}
    if dt_from:
        pay_filt["created_at"] = {"$gte": dt_from}
    if dt_to:
        pay_filt.setdefault("created_at", {})["$lte"] = dt_to
    for p in db[C.customer_payments].find(pay_filt).sort("created_at", 1):
        entries.append({
            "type": "payment",
            "date": p.get("created_at"),
            "op_no": p.get("receipt_no") or p["_id"],
            "description": "سند قبض",
            "debit": 0.0,
            "credit": float(p.get("amount", 0)),
            "ref_id": p["_id"],
            "voided": False,
        })

    # Customer sale returns (مرتجعات)
    ret_filt = {"customer_id": customer_id, "deleted_at": None}
    if dt_from:
        ret_filt["created_at"] = {"$gte": dt_from}
    if dt_to:
        ret_filt.setdefault("created_at", {})["$lte"] = dt_to
    for r in db[C.sale_returns].find(ret_filt).sort("created_at", 1):
        entries.append({
            "type": "return",
            "date": r.get("created_at"),
            "op_no": r.get("return_no") or r["_id"],
            "description": "مرتجع مبيعات",
            "debit": 0.0,
            "credit": float(r.get("total", 0)),
            "ref_id": r["_id"],
            "voided": False,
        })

    entries.sort(key=lambda e: e["date"] or datetime.min.replace(tzinfo=timezone.utc))

    balance = 0.0
    for e in entries:
        balance += e["debit"] - e["credit"]
        e["balance"] = balance

    now = datetime.now(timezone.utc)
    return {
        "opening_balance": 0,
        "closing_balance": balance,
        "period": {
            "from": date_from[:10] if date_from else None,
            "to": date_to[:10] if date_to else None,
        },
        "generated_at": now,
        "entries": entries,
    }


# ─── Customer payments list ───────────────────────────────────────────────────

@router.get("/customers/{customer_id}/payments")
def list_customer_payments(customer_id: str, db=Depends(get_db), _u=Depends(get_current_user)):
    rows = list(db[C.customer_payments].find({"customer_id": customer_id}).sort("created_at", -1).limit(200))
    out = []
    for p in rows:
        out.append({
            "id": p["_id"],
            "receipt_no": p.get("receipt_no") or p["_id"],
            "amount": p.get("amount", 0),
            "payment_method": p.get("payment_method") or p.get("method", "cash"),
            "notes": p.get("notes"),
            "created_by_name": _user_name(db, p.get("received_by") or p.get("created_by", "")),
            "created_at": p.get("created_at"),
        })
    return out


# ─── Record customer payment ──────────────────────────────────────────────────

class CustomerPaymentIn(BaseModel):
    amount: float = Field(..., gt=0)
    payment_method: str = Field(default="cash")
    notes: Optional[str] = None


@router.post("/customers/{customer_id}/payments", status_code=201)
def record_payment(customer_id: str, payload: CustomerPaymentIn, request: Request,
                   db=Depends(get_db), current=Depends(require_manager)):
    c = db[C.customers].find_one({"_id": customer_id, "deleted_at": None})
    if not c:
        raise HTTPException(404, "Customer not found")
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y%m%d")
    count = db[C.customer_payments].count_documents({"receipt_no": {"$regex": f"^RCP-{today}-"}})
    receipt_no = f"RCP-{today}-{count + 1:05d}"
    pid = new_id()
    db[C.customer_payments].insert_one({
        "_id": pid, "customer_id": customer_id,
        "amount": float(payload.amount),
        "method": payload.payment_method,
        "payment_method": payload.payment_method,
        "receipt_no": receipt_no,
        "notes": payload.notes,
        "received_by": current["_id"],
        "created_by": current["_id"],
        "created_at": now,
    })
    db[C.customers].update_one({"_id": customer_id},
                               {"$inc": {"balance": -float(payload.amount)},
                                "$set": {"updated_at": now}})
    log_action(db, current["_id"], "customer_payment_received", "customer_payments", pid,
               after={"amount": str(payload.amount), "receipt_no": receipt_no}, request=request)
    return {
        "id": pid, "receipt_no": receipt_no,
        "amount": payload.amount,
        "payment_method": payload.payment_method,
        "notes": payload.notes,
        "created_by_name": _user_name(db, current["_id"]),
        "created_at": now,
    }


# ─── Customer sale detail ─────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/sales/{sale_id}/detail")
def customer_sale_detail(customer_id: str, sale_id: str,
                         db=Depends(get_db), _u=Depends(get_current_user)):
    s = db[C.sales].find_one({"_id": sale_id, "customer_id": customer_id})
    if not s:
        raise HTTPException(404, "Sale not found")
    items_raw = list(db[C.sale_items].find({"sale_id": sale_id}))
    items_out = []
    for it in items_raw:
        prod = db[C.products].find_one({"_id": it.get("product_id")}, {"name": 1})
        items_out.append({
            "product_name": prod["name"] if prod else it.get("product_id", ""),
            "quantity": it.get("quantity", 0),
            "unit_price": it.get("unit_price", 0),
            "total": it.get("total", 0),
        })
    cashier = db[C.users].find_one({"_id": s.get("cashier_id")}, {"username": 1, "full_name": 1})
    return {
        "id": s["_id"],
        "invoice_no": s.get("invoice_no") or s.get("sale_number"),
        "cashier_name": (cashier.get("full_name") or cashier.get("username")) if cashier else None,
        "payment_method": s.get("payment_method"),
        "status": s.get("status", "completed"),
        "total": s.get("total", 0),
        "created_at": s.get("created_at"),
        "items": items_out,
    }


# ─── Single customer payment detail ──────────────────────────────────────────

@router.get("/customer-payments/{payment_id}")
def get_customer_payment(payment_id: str, db=Depends(get_db), _u=Depends(get_current_user)):
    p = db[C.customer_payments].find_one({"_id": payment_id})
    if not p:
        raise HTTPException(404, "Payment not found")
    return {
        "id": p["_id"],
        "receipt_no": p.get("receipt_no") or p["_id"],
        "amount": p.get("amount", 0),
        "payment_method": p.get("payment_method") or p.get("method", "cash"),
        "notes": p.get("notes"),
        "created_by_name": _user_name(db, p.get("received_by") or p.get("created_by", "")),
        "created_at": p.get("created_at"),
    }


# ─── Legacy endpoint ──────────────────────────────────────────────────────────

@router.get("/customer-accounts")
def list_customer_accounts(db=Depends(get_db), _u=Depends(get_current_user)):
    rows = list(db[C.customers].find({"deleted_at": None}).sort("full_name", 1))
    return [{
        "id": c["_id"], "full_name": c["full_name"], "phone": c.get("phone"),
        "balance": c.get("balance", 0), "credit_limit": c.get("credit_limit", 0),
    } for c in rows]


@router.get("/customer-accounts/{customer_id}/statement")
def statement_legacy(customer_id: str, db=Depends(get_db), _u=Depends(get_current_user)):
    return customer_statement(customer_id, db=db, _u=_u)


@router.post("/customer-accounts/{customer_id}/payments")
def record_payment_legacy(customer_id: str, payload: CustomerPaymentIn, request: Request,
                          db=Depends(get_db), current=Depends(require_manager)):
    return record_payment(customer_id, payload, request, db, current)
