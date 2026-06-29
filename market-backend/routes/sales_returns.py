"""Sale returns (instant refund/exchange) — MongoDB minimal.

Two URL conventions are supported by frontend:
  • Nested: POST /api/sales/{sale_id}/returns
  • Flat  : POST /api/sales-returns/instant, GET /api/sales-returns,
             GET /api/sales-returns/search-sales, POST /api/sales-exchanges
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field
from typing import List, Optional

from database import get_db, C
from models import new_id, MovementType
from utils.deps import require_cashier
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["sales-returns"])


class ReturnItemIn(BaseModel):
    sale_item_id: str
    quantity: float = Field(..., gt=0)


class SaleReturnCreate(BaseModel):
    sale_id: str
    items: List[ReturnItemIn]
    reason: Optional[str] = None
    return_type: str = Field(default="cash", description="cash | exchange")


def _create_return(db, payload: SaleReturnCreate, current) -> dict:
    sale = db[C.sales].find_one({"_id": payload.sale_id, "deleted_at": None})
    if not sale:
        raise HTTPException(404, "Sale not found")
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y%m%d")
    cnt = db[C.sale_returns].count_documents({"return_no": {"$regex": f"^RET-{today}-"}})
    return_no = f"RET-{today}-{cnt + 1:05d}"
    rid = new_id()
    subtotal = 0.0
    for it in payload.items:
        si = db[C.sale_items].find_one({"_id": it.sale_item_id, "sale_id": payload.sale_id})
        if not si:
            raise HTTPException(400, f"Sale item {it.sale_item_id} not found")
        if it.quantity > float(si["quantity"]):
            raise HTTPException(400, "Return qty exceeds sold qty")
        line_total = it.quantity * float(si["unit_price"])
        subtotal += line_total
        db[C.sale_return_items].insert_one({
            "_id": new_id(), "return_id": rid, "sale_item_id": it.sale_item_id,
            "product_id": si["product_id"], "quantity": it.quantity,
            "unit_price": float(si["unit_price"]), "total": line_total,
        })
        db[C.products].update_one({"_id": si["product_id"]},
                                  {"$inc": {"current_stock": it.quantity},
                                   "$set": {"updated_at": now}})
        db[C.inventory_movements].insert_one({
            "_id": new_id(), "product_id": si["product_id"],
            "movement_type": MovementType.return_in.value, "quantity": it.quantity,
            "reference_table": "sale_returns", "reference_id": rid,
            "user_id": current["_id"], "notes": f"Return {return_no}",
            "created_at": now,
        })
    db[C.sale_returns].insert_one({
        "_id": rid, "return_no": return_no, "sale_id": payload.sale_id,
        "customer_id": sale.get("customer_id"),
        "subtotal": subtotal, "total": subtotal,
        "reason": payload.reason, "return_type": payload.return_type,
        "status": "approved", "created_by": current["_id"],
        "approved_by": current["_id"], "approved_at": now,
        "created_at": now, "updated_at": now, "deleted_at": None,
    })
    log_action(db, current["_id"], "sale_return_created", "sale_returns", rid,
               after={"return_no": return_no, "total": str(subtotal)})
    return {"id": rid, "return_no": return_no, "total": subtotal}


@router.post("/sales/{sale_id}/returns", status_code=201)
def create_return(sale_id: str, payload: SaleReturnCreate, request: Request,
                  db = Depends(get_db), current = Depends(require_cashier)):
    payload.sale_id = sale_id
    return _create_return(db, payload, current)


@router.post("/sales-returns/instant", status_code=201)
def instant_return(payload: SaleReturnCreate, request: Request,
                   db = Depends(get_db), current = Depends(require_cashier)):
    return _create_return(db, payload, current)


@router.get("/sales-returns")
def list_returns(limit: int = Query(100, le=500),
                 db = Depends(get_db), _u = Depends(require_cashier)):
    rows = list(db[C.sale_returns].find({"deleted_at": None}
                                         ).sort("created_at", -1).limit(limit))
    return [{
        "id": r["_id"], "return_no": r.get("return_no"),
        "sale_id": r.get("sale_id"), "total": r.get("total", 0),
        "status": r.get("status"), "reason": r.get("reason"),
        "return_type": r.get("return_type"),
        "created_at": r.get("created_at"),
    } for r in rows]


@router.get("/sales/{sale_id}/returns")
def list_returns_for_sale(sale_id: str, db = Depends(get_db),
                          _u = Depends(require_cashier)):
    rows = list(db[C.sale_returns].find({"sale_id": sale_id, "deleted_at": None}
                                         ).sort("created_at", -1))
    return [{
        "id": r["_id"], "return_no": r.get("return_no"),
        "total": r.get("total", 0), "status": r.get("status"),
        "reason": r.get("reason"), "return_type": r.get("return_type"),
        "created_at": r.get("created_at"),
    } for r in rows]


@router.get("/sales-returns/search-sales")
def search_sales_for_return(q: Optional[str] = None, limit: int = Query(50, le=200),
                            db = Depends(get_db), _u = Depends(require_cashier)):
    """Find sales by invoice_no for return UI."""
    filt = {"deleted_at": None, "status": "completed"}
    if q:
        filt["invoice_no"] = {"$regex": q, "$options": "i"}
    rows = list(db[C.sales].find(filt).sort("created_at", -1).limit(limit))
    return [{
        "id": s["_id"], "invoice_no": s.get("invoice_no"),
        "total": s.get("total", 0),
        "payment_method": s.get("payment_method"),
        "customer_id": s.get("customer_id"),
        "created_at": s.get("created_at"),
    } for s in rows]


# ─── Exchanges (return + new items in one transaction) ───
class ExchangePayload(BaseModel):
    return_payload: SaleReturnCreate
    new_sale_id: Optional[str] = None


@router.post("/sales-exchanges", status_code=201)
def create_exchange(payload: ExchangePayload, request: Request,
                    db = Depends(get_db), current = Depends(require_cashier)):
    """Process an exchange = return + (already created new sale)."""
    r = _create_return(db, payload.return_payload, current)
    return {**r, "new_sale_id": payload.new_sale_id}


# ─── Supplier returns (separate concept; minimal stub) ───
@router.get("/supplier-returns")
def list_supplier_returns(db = Depends(get_db), _u = Depends(require_cashier)):
    rows = list(db[C.supplier_returns].find({"deleted_at": None}
                                             ).sort("created_at", -1).limit(100))
    return [{"id": r["_id"], "return_no": r.get("return_no"),
              "supplier_id": r.get("supplier_id"), "total": r.get("total", 0),
              "created_at": r.get("created_at")} for r in rows]
