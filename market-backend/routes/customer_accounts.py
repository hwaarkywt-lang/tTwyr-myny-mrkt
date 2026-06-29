"""Customer accounts: list balances + payment recording. MongoDB."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional

from database import get_db, C
from models import new_id
from utils.deps import get_current_user, require_manager
from utils.audit import log_action

router = APIRouter(prefix="/api/customer-accounts", tags=["customer-accounts"])


@router.get("")
def list_customer_accounts(db = Depends(get_db), _u = Depends(get_current_user)):
    rows = list(db[C.customers].find({"deleted_at": None}).sort("full_name", 1))
    return [{
        "id": c["_id"], "full_name": c["full_name"], "phone": c.get("phone"),
        "balance": c.get("balance", 0), "credit_limit": c.get("credit_limit", 0),
    } for c in rows]


@router.get("/{customer_id}/statement")
def statement(customer_id: str, db = Depends(get_db), _u = Depends(get_current_user)):
    c = db[C.customers].find_one({"_id": customer_id, "deleted_at": None})
    if not c:
        raise HTTPException(404, "Customer not found")
    sales = list(db[C.sales].find({"customer_id": customer_id, "payment_method": "credit"}
                                   ).sort("created_at", -1).limit(200))
    payments = list(db[C.customer_payments].find({"customer_id": customer_id}
                                                  ).sort("created_at", -1).limit(200))
    return {
        "customer": {"id": c["_id"], "full_name": c["full_name"], "phone": c.get("phone"),
                     "balance": c.get("balance", 0)},
        "sales": [{"id": s["_id"], "invoice_no": s.get("invoice_no"),
                    "total": s.get("total", 0), "created_at": s.get("created_at")}
                   for s in sales],
        "payments": [{"id": p["_id"], "amount": p.get("amount", 0),
                       "method": p.get("method"), "notes": p.get("notes"),
                       "created_at": p.get("created_at")} for p in payments],
    }


class PaymentIn(BaseModel):
    amount: float = Field(..., gt=0)
    method: str = Field(default="cash")
    notes: Optional[str] = None


@router.post("/{customer_id}/payments")
def record_payment(customer_id: str, payload: PaymentIn, request: Request,
                   db = Depends(get_db), current = Depends(require_manager)):
    c = db[C.customers].find_one({"_id": customer_id, "deleted_at": None})
    if not c:
        raise HTTPException(404, "Customer not found")
    now = datetime.now(timezone.utc)
    pid = new_id()
    db[C.customer_payments].insert_one({
        "_id": pid, "customer_id": customer_id,
        "amount": float(payload.amount), "method": payload.method,
        "notes": payload.notes, "received_by": current["_id"],
        "created_at": now,
    })
    db[C.customers].update_one({"_id": customer_id},
                               {"$inc": {"balance": -float(payload.amount)},
                                "$set": {"updated_at": now}})
    log_action(db, current["_id"], "customer_payment_received", "customer_payments", pid,
               after={"amount": str(payload.amount)}, request=request)
    return {"id": pid, "detail": "تم تسجيل الدفعة"}
