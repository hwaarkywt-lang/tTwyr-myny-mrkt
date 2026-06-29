"""MongoDB connection module — replaces SQLAlchemy/PostgreSQL.

Uses PyMongo (sync) so existing route functions keep their `def` signatures.
A FastAPI dependency `get_db()` yields the database handle.
"""
import os
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.database import Database

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "market_db")

_client: MongoClient = MongoClient(MONGO_URL, uuidRepresentation="standard", tz_aware=True)
db: Database = _client[DB_NAME]


def get_db() -> Database:
    """FastAPI dependency that yields the MongoDB database handle."""
    return db


def get_client() -> MongoClient:
    return _client


# ────────────── Collection name constants ──────────────
class C:
    users = "users"
    settings = "settings"
    categories = "categories"
    products = "products"
    barcodes = "barcodes"
    product_batches = "product_batches"
    customers = "customers"
    suppliers = "suppliers"
    customer_accounts = "customer_accounts"
    supplier_accounts = "supplier_accounts"
    customer_payments = "customer_payments"
    supplier_payments = "supplier_payments"
    shifts = "shifts"
    sales = "sales"
    sale_items = "sale_items"
    sale_payments = "sale_payments"
    sale_returns = "sale_returns"
    sale_return_items = "sale_return_items"
    purchases = "purchases"
    purchase_items = "purchase_items"
    supplier_returns = "supplier_returns"
    supplier_return_items = "supplier_return_items"
    inventory_movements = "inventory_movements"
    stock_audits = "stock_audits"
    stock_audit_items = "stock_audit_items"
    expenses = "expenses"
    expense_categories = "expense_categories"
    audit_logs = "audit_logs"
    notifications = "notifications"
    devices = "devices"
    sync_queue = "sync_queue"
    product_change_requests = "product_change_requests"
    day_closes = "day_closes"


def init_indexes():
    """Create indexes for fast queries. Idempotent."""
    db[C.users].create_index([("username", ASCENDING)], unique=True)
    db[C.users].create_index([("email", ASCENDING)], unique=True)
    db[C.users].create_index([("role", ASCENDING)])
    db[C.settings].create_index([("key", ASCENDING)], unique=True)
    db[C.products].create_index([("sku", ASCENDING)], unique=True, sparse=True)
    db[C.products].create_index([("name", ASCENDING)])
    db[C.products].create_index([("is_featured", ASCENDING), ("featured_order", ASCENDING)])
    db[C.products].create_index([("expiry_date", ASCENDING)])
    db[C.categories].create_index([("name", ASCENDING)], unique=True)
    db[C.barcodes].create_index([("barcode", ASCENDING)], unique=True)
    db[C.barcodes].create_index([("product_id", ASCENDING)])
    db[C.customers].create_index([("phone", ASCENDING)])
    db[C.suppliers].create_index([("name", ASCENDING)])
    db[C.sales].create_index([("sale_number", ASCENDING)], unique=True, sparse=True)
    db[C.sales].create_index([("created_at", DESCENDING)])
    db[C.sale_items].create_index([("sale_id", ASCENDING)])
    db[C.expense_categories].create_index([("name", ASCENDING)], unique=True)
    db[C.expenses].create_index([("created_at", DESCENDING)])
    db[C.audit_logs].create_index([("created_at", DESCENDING)])
    db[C.notifications].create_index([("user_id", ASCENDING), ("read", ASCENDING)])
