"""Catalog endpoints — MongoDB. Products, categories, change-requests."""
from datetime import datetime, timezone, date as _date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from typing import List, Optional

from database import get_db, C
from models import new_id, MovementType
from schemas.catalog import (
    CategoryCreate, CategoryOut, ProductCreate, ProductUpdate, ProductOut,
)
from utils.deps import get_current_user, require_manager, require_admin
from utils.audit import log_action

router = APIRouter(prefix="/api", tags=["catalog"])

NUMERIC_FIELDS = {"cost_price", "sale_price", "tax_rate", "current_stock"}


def _dec(v) -> Decimal:
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


# ─── Categories ───
def _cat_out(c) -> dict:
    return {
        "id": c["_id"], "name": c["name"],
        "parent_id": c.get("parent_id"), "description": c.get("description"),
        "is_active": c.get("is_active", True), "created_at": c.get("created_at"),
    }


@router.get("/categories", response_model=List[CategoryOut])
def list_categories(db = Depends(get_db), _u = Depends(get_current_user)):
    rows = list(db[C.categories].find({"deleted_at": None}).sort("name", 1))
    return [CategoryOut.model_validate(_cat_out(c)) for c in rows]


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryCreate, request: Request,
                    db = Depends(get_db), current = Depends(require_manager)):
    now = datetime.now(timezone.utc)
    cat_id = new_id()
    db[C.categories].insert_one({
        "_id": cat_id, "name": payload.name,
        "parent_id": payload.parent_id, "description": payload.description,
        "is_active": True, "created_at": now, "updated_at": now, "deleted_at": None,
    })
    log_action(db, current["_id"], "category_created", "categories", cat_id,
               after={"name": payload.name}, request=request)
    c = db[C.categories].find_one({"_id": cat_id})
    return CategoryOut.model_validate(_cat_out(c))


# ─── Products ───
def _product_out(p, db, role: str) -> dict:
    bcodes = [b["barcode"] for b in db[C.barcodes].find({"product_id": p["_id"]}, {"barcode": 1})]
    cat = db[C.categories].find_one({"_id": p.get("category_id")}) if p.get("category_id") else None
    is_admin = role == "admin"
    return {
        "id": p["_id"], "sku": p.get("sku"), "name": p["name"],
        "description": p.get("description"),
        "category_id": p.get("category_id"),
        "category_name": cat["name"] if cat else None,
        "unit": p.get("unit", "piece"),
        "cost_price": _dec(p.get("cost_price")) if is_admin else Decimal("0"),
        "sale_price": _dec(p.get("sale_price")),
        "tax_rate": _dec(p.get("tax_rate", 0)),
        "min_stock_level": p.get("min_stock_level", 0),
        "max_stock_level": p.get("max_stock_level"),
        "current_stock": _dec(p.get("current_stock", 0)),
        "has_expiry": p.get("has_expiry", False),
        "expiry_date": p.get("expiry_date"),
        "is_featured": p.get("is_featured", False),
        "featured_order": p.get("featured_order", 0),
        "is_active": p.get("is_active", True),
        "image_url": p.get("image_url"),
        "barcodes": bcodes,
        "created_at": p.get("created_at"),
    }


@router.get("/products", response_model=List[ProductOut])
def list_products(q: Optional[str] = None, category_id: Optional[str] = None,
                  low_stock: bool = False, limit: int = Query(200, le=1000),
                  db = Depends(get_db), current = Depends(get_current_user)):
    if current.role == "cashier":
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول للمنتجات")

    filt = {"deleted_at": None}
    if category_id:
        filt["category_id"] = category_id
    if q:
        # search across name, sku, and barcodes
        barcode_matches = [b["product_id"] for b in
                           db[C.barcodes].find({"barcode": {"$regex": q, "$options": "i"}})]
        filt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"sku": {"$regex": q, "$options": "i"}},
            {"_id": {"$in": barcode_matches}},
        ]
    rows = list(db[C.products].find(filt).sort("name", 1).limit(limit))
    if low_stock:
        rows = [r for r in rows if float(r.get("current_stock", 0)) <= float(r.get("min_stock_level", 0))]
    return [ProductOut.model_validate(_product_out(p, db, current.role)) for p in rows]


@router.get("/pos/products", response_model=List[ProductOut])
def list_products_for_pos(q: Optional[str] = None,
                          featured_only: bool = Query(False),
                          limit: int = Query(500, le=2000),
                          db = Depends(get_db), current = Depends(get_current_user)):
    filt = {"deleted_at": None, "is_active": True}
    if q:
        barcode_matches = [b["product_id"] for b in
                           db[C.barcodes].find({"barcode": {"$regex": q, "$options": "i"}})]
        filt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"sku": {"$regex": q, "$options": "i"}},
            {"_id": {"$in": barcode_matches}},
        ]
        rows = list(db[C.products].find(filt).sort("name", 1).limit(limit))
    elif featured_only:
        filt["is_featured"] = True
        rows = list(db[C.products].find(filt).sort([("featured_order", 1), ("name", 1)]).limit(limit))
    else:
        rows = list(db[C.products].find(filt).sort("name", 1).limit(limit))
    return [ProductOut.model_validate(_product_out(p, db, current.role)) for p in rows]


@router.patch("/products/{product_id}/featured", response_model=ProductOut)
def toggle_featured(product_id: str, payload: dict,
                    db = Depends(get_db), current = Depends(require_manager)):
    update = {"is_featured": bool(payload.get("is_featured", False))}
    if "featured_order" in payload:
        update["featured_order"] = int(payload.get("featured_order") or 0)
    update["updated_at"] = datetime.now(timezone.utc)
    r = db[C.products].update_one({"_id": product_id, "deleted_at": None}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404, "المنتج غير موجود")
    p = db[C.products].find_one({"_id": product_id})
    return ProductOut.model_validate(_product_out(p, db, current.role))


@router.get("/products/expiry-report")
def expiry_report(days: int = Query(90, ge=1, le=365),
                  db = Depends(get_db), current = Depends(require_manager)):
    today = _date.today()
    threshold = today + timedelta(days=days)
    today_dt = datetime.combine(today, datetime.min.time())
    thr_dt = datetime.combine(threshold, datetime.min.time())

    rows = list(db[C.products].find({
        "deleted_at": None, "is_active": True,
        "expiry_date": {"$ne": None, "$lte": thr_dt},
    }).sort("expiry_date", 1))

    soon, expired = [], []
    for p in rows:
        ed = p["expiry_date"]
        if hasattr(ed, "date"):
            ed_date = ed.date()
        else:
            ed_date = ed
        days_left = (ed_date - today).days
        item = {
            "id": p["_id"], "sku": p.get("sku"), "name": p["name"],
            "expiry_date": ed_date.isoformat(),
            "days_left": days_left,
            "current_stock": float(p.get("current_stock", 0) or 0),
            "unit": p.get("unit", "piece"),
            "severity": ("expired" if days_left < 0 else
                         "critical" if days_left <= 7 else
                         "warning" if days_left <= 30 else "notice"),
        }
        (expired if days_left < 0 else soon).append(item)
    return {"today": today.isoformat(), "threshold_days": days,
            "soon_count": len(soon), "expired_count": len(expired),
            "soon": soon, "expired": expired}


@router.get("/products/by-barcode/{barcode}", response_model=ProductOut)
def get_by_barcode(barcode: str, db = Depends(get_db), current = Depends(get_current_user)):
    b = db[C.barcodes].find_one({"barcode": barcode})
    if not b:
        raise HTTPException(status_code=404, detail="Barcode not found")
    p = db[C.products].find_one({"_id": b["product_id"], "deleted_at": None})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductOut.model_validate(_product_out(p, db, current.role))


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db = Depends(get_db), current = Depends(get_current_user)):
    p = db[C.products].find_one({"_id": product_id, "deleted_at": None})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductOut.model_validate(_product_out(p, db, current.role))


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(payload: ProductCreate, request: Request,
                   db = Depends(get_db), current = Depends(require_manager)):
    if db[C.products].find_one({"sku": payload.sku, "deleted_at": None}):
        raise HTTPException(status_code=409, detail="SKU موجود مسبقاً")
    now = datetime.now(timezone.utc)
    is_admin = current.role == "admin"
    pid = new_id()
    cost = float(payload.cost_price) if is_admin else 0.0
    expiry_dt = None
    if payload.expiry_date:
        expiry_dt = datetime.combine(payload.expiry_date, datetime.min.time())
    doc_p = {
        "_id": pid, "sku": payload.sku, "name": payload.name,
        "description": payload.description, "category_id": payload.category_id,
        "unit": payload.unit, "cost_price": cost,
        "sale_price": float(payload.sale_price), "tax_rate": float(payload.tax_rate or 0),
        "min_stock_level": payload.min_stock_level,
        "max_stock_level": payload.max_stock_level,
        "current_stock": float(payload.current_stock or 0),
        "has_expiry": payload.has_expiry, "expiry_date": expiry_dt,
        "is_featured": payload.is_featured, "featured_order": payload.featured_order,
        "is_active": True, "image_url": payload.image_url,
        "created_at": now, "updated_at": now, "deleted_at": None,
    }
    db[C.products].insert_one(doc_p)
    for i, code in enumerate(payload.barcodes or []):
        db[C.barcodes].insert_one({
            "_id": new_id(), "product_id": pid, "barcode": code,
            "is_primary": (i == 0), "created_at": now,
        })
    if payload.current_stock and float(payload.current_stock) > 0:
        db[C.inventory_movements].insert_one({
            "_id": new_id(), "product_id": pid,
            "movement_type": MovementType.adjustment.value,
            "quantity": float(payload.current_stock), "user_id": current["_id"],
            "notes": "Initial stock", "created_at": now,
        })
    log_action(db, current["_id"], "product_created", "products", pid,
               after={"sku": payload.sku, "name": payload.name,
                      "sale_price": str(payload.sale_price)}, request=request)
    p = db[C.products].find_one({"_id": pid})
    return ProductOut.model_validate(_product_out(p, db, current.role))


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: str, payload: ProductUpdate, request: Request,
                   db = Depends(get_db), current = Depends(require_manager)):
    p = db[C.products].find_one({"_id": product_id, "deleted_at": None})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if current.role != "admin":
        log_action(db, current["_id"], "unauthorized_product_edit_attempt",
                   "products", product_id,
                   after={"role": current.role,
                          "fields": list(payload.model_dump(exclude_unset=True).keys())},
                   request=request)
        raise HTTPException(status_code=403,
                            detail="تعديل المنتجات والأسعار من صلاحيات المدير حصراً.")
    data = payload.model_dump(exclude_unset=True)
    before = {"name": p["name"], "sale_price": str(p.get("sale_price")),
              "cost_price": str(p.get("cost_price")),
              "min_stock_level": p.get("min_stock_level"),
              "is_active": p.get("is_active", True)}
    update = {}
    for k, v in data.items():
        if k == "expiry_date" and v is not None:
            update[k] = datetime.combine(v, datetime.min.time())
        elif k in NUMERIC_FIELDS and v is not None:
            update[k] = float(v)
        else:
            update[k] = v
    update["updated_at"] = datetime.now(timezone.utc)
    db[C.products].update_one({"_id": product_id}, {"$set": update})
    log_action(db, current["_id"], "product_updated", "products", product_id,
               before=before, after={k: str(update.get(k, before[k])) for k in before},
               request=request)
    p = db[C.products].find_one({"_id": product_id})
    return ProductOut.model_validate(_product_out(p, db, current.role))


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: str, request: Request,
                   db = Depends(get_db), current = Depends(require_admin)):
    p = db[C.products].find_one({"_id": product_id, "deleted_at": None})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    now = datetime.now(timezone.utc)
    db[C.products].update_one({"_id": product_id}, {"$set": {
        "deleted_at": now, "is_active": False, "updated_at": now,
    }})
    log_action(db, current["_id"], "product_deleted", "products", product_id, request=request)
    return None


@router.post("/products/{product_id}/adjust-stock")
def adjust_stock(product_id: str, quantity: float, notes: Optional[str] = None,
                 request: Request = None, db = Depends(get_db),
                 current = Depends(require_manager)):
    p = db[C.products].find_one({"_id": product_id, "deleted_at": None})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    new_stock = float(p.get("current_stock", 0) or 0) + float(quantity)
    if new_stock < 0 and current.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="المخزون السالب يتطلب صلاحية المدير")
    now = datetime.now(timezone.utc)
    db[C.products].update_one({"_id": product_id},
                              {"$set": {"current_stock": new_stock, "updated_at": now}})
    db[C.inventory_movements].insert_one({
        "_id": new_id(), "product_id": product_id,
        "movement_type": MovementType.adjustment.value,
        "quantity": float(quantity), "user_id": current["_id"],
        "notes": notes or "Manual adjustment", "created_at": now,
    })
    log_action(db, current["_id"], "stock_adjusted", "products", product_id,
               after={"quantity": str(quantity), "new_stock": str(new_stock)}, request=request)
    return {"product_id": product_id, "current_stock": str(new_stock)}


# ─── Product change requests (admin-only listing; create endpoints are gated 403) ───
@router.get("/product-change-requests")
def list_change_requests(status_filter: Optional[str] = Query(None, alias="status"),
                         db = Depends(get_db), current = Depends(require_admin)):
    filt = {}
    if status_filter:
        filt["status"] = status_filter
    rows = list(db[C.product_change_requests].find(filt).sort("created_at", -1).limit(200))
    out = []
    for cr in rows:
        product = db[C.products].find_one({"_id": cr.get("product_id")})
        requester = db[C.users].find_one({"_id": cr.get("requested_by")})
        reviewer = db[C.users].find_one({"_id": cr.get("reviewed_by")}) if cr.get("reviewed_by") else None
        clean_after = dict(cr.get("after_data") or {})
        change_reason = clean_after.pop("_reason", None)
        out.append({
            "id": cr["_id"], "product_id": cr.get("product_id"),
            "product_name": product["name"] if product else None,
            "product_sku": product.get("sku") if product else None,
            "requested_by": cr.get("requested_by"),
            "requester_name": requester["full_name"] if requester else None,
            "reviewer_name": reviewer["full_name"] if reviewer else None,
            "request_type": cr.get("request_type"),
            "before_data": cr.get("before_data"),
            "after_data": clean_after,
            "change_reason": change_reason,
            "status": cr.get("status"),
            "rejection_reason": cr.get("rejection_reason"),
            "created_at": cr["created_at"].isoformat() if cr.get("created_at") else None,
            "reviewed_at": cr["reviewed_at"].isoformat() if cr.get("reviewed_at") else None,
        })
    return out


@router.post("/products/{product_id}/request-price-change", status_code=403, deprecated=True)
def request_price_change(product_id: str, request: Request,
                         db = Depends(get_db), current = Depends(get_current_user)):
    if current.role != "admin":
        log_action(db, current["_id"], "unauthorized_price_change_attempt",
                   "products", product_id,
                   after={"role": current.role}, request=request)
    raise HTTPException(status_code=403,
                        detail="تعديل الأسعار من صلاحيات المدير حصراً.")
