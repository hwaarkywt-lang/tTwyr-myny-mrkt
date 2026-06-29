"""Model layer — MongoDB version.

We no longer use SQLAlchemy ORM classes. Each "model" is now just a Python class
with collection-name + role/enum constants + small dict-helpers for serialization.
Pydantic models in /schemas/ handle request/response validation.
"""
import enum
from datetime import datetime, timezone
from typing import Optional
import uuid

from database import C, db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


# ───────── Enums (preserved verbatim from old SQLAlchemy version) ─────────
class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    cashier = "cashier"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    credit = "credit"
    transfer = "transfer"
    mixed = "mixed"


class SaleStatus(str, enum.Enum):
    completed = "completed"
    voided = "voided"
    refunded = "refunded"


class SaleReturnStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ShiftStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class MovementType(str, enum.Enum):
    purchase = "purchase"
    sale = "sale"
    return_in = "return_in"
    return_out = "return_out"
    adjustment = "adjustment"
    audit = "audit"


class SyncStatus(str, enum.Enum):
    pending = "pending"
    synced = "synced"
    failed = "failed"


# ───────── Helper: dict→object that mimics SQLAlchemy attribute access ─────────
class Doc(dict):
    """Dict subclass that allows attribute-style access (d.field == d['field']).
    Lets route code that does `user.username` keep working after we replaced
    SQLAlchemy with dicts."""
    def __getattr__(self, name):
        if name in self:
            return self[name]
        # Soft fallback for missing keys
        if name in ("id",) and "_id" in self:
            return self["_id"]
        raise AttributeError(name)

    def __setattr__(self, name, value):
        self[name] = value


def doc(d: Optional[dict]) -> Optional[Doc]:
    """Wrap a Mongo doc in our attribute-friendly Doc class."""
    if d is None:
        return None
    if not isinstance(d, Doc):
        d = Doc(d)
    # Always expose `id` (the string UUID) for downstream code
    if "_id" in d and "id" not in d:
        d["id"] = d["_id"]
    return d


# ───────── Stub model classes — used for `User`-style imports only ─────────
class _ModelMeta(type):
    """Metaclass that gives subclasses .collection / .find_one / .insert_one helpers."""
    def __getattr__(cls, name):
        if name == "collection":
            return db[cls.__collection__]
        raise AttributeError(name)


class _BaseModel(metaclass=_ModelMeta):
    __collection__ = ""


class User(_BaseModel):
    __collection__ = C.users


class Setting(_BaseModel):
    __collection__ = C.settings


class Category(_BaseModel):
    __collection__ = C.categories


class Product(_BaseModel):
    __collection__ = C.products


class Barcode(_BaseModel):
    __collection__ = C.barcodes


class ProductBatch(_BaseModel):
    __collection__ = C.product_batches


class Customer(_BaseModel):
    __collection__ = C.customers


class Supplier(_BaseModel):
    __collection__ = C.suppliers


class Shift(_BaseModel):
    __collection__ = C.shifts


class Sale(_BaseModel):
    __collection__ = C.sales


class SaleItem(_BaseModel):
    __collection__ = C.sale_items


class SalePayment(_BaseModel):
    __collection__ = C.sale_payments


class SaleReturn(_BaseModel):
    __collection__ = C.sale_returns


class SaleReturnItem(_BaseModel):
    __collection__ = C.sale_return_items


class Purchase(_BaseModel):
    __collection__ = C.purchases


class PurchaseItem(_BaseModel):
    __collection__ = C.purchase_items


class SupplierReturn(_BaseModel):
    __collection__ = C.supplier_returns


class SupplierReturnItem(_BaseModel):
    __collection__ = C.supplier_return_items


class InventoryMovement(_BaseModel):
    __collection__ = C.inventory_movements


class StockAudit(_BaseModel):
    __collection__ = C.stock_audits


class StockAuditItem(_BaseModel):
    __collection__ = C.stock_audit_items


class Expense(_BaseModel):
    __collection__ = C.expenses


class ExpenseCategory(_BaseModel):
    __collection__ = C.expense_categories


class AuditLog(_BaseModel):
    __collection__ = C.audit_logs


class SyncQueue(_BaseModel):
    __collection__ = C.sync_queue


class Notification(_BaseModel):
    __collection__ = C.notifications


class Device(_BaseModel):
    __collection__ = C.devices


class ProductChangeRequest(_BaseModel):
    __collection__ = C.product_change_requests


class CustomerPayment(_BaseModel):
    __collection__ = C.customer_payments


class SupplierPayment(_BaseModel):
    __collection__ = C.supplier_payments


class DayClose(_BaseModel):
    __collection__ = C.day_closes


__all__ = [
    "utcnow", "new_id", "doc", "Doc",
    "UserRole", "PaymentMethod", "SaleStatus", "SaleReturnStatus", "ShiftStatus",
    "MovementType", "SyncStatus",
    "User", "Setting", "Category", "Product", "Barcode", "ProductBatch",
    "Customer", "Supplier",
    "Shift", "Sale", "SaleItem", "SalePayment",
    "SaleReturn", "SaleReturnItem",
    "Purchase", "PurchaseItem",
    "SupplierReturn", "SupplierReturnItem",
    "InventoryMovement", "StockAudit", "StockAuditItem",
    "Expense", "ExpenseCategory",
    "AuditLog", "SyncQueue", "Notification", "Device",
    "ProductChangeRequest", "CustomerPayment", "SupplierPayment",
    "DayClose",
]
