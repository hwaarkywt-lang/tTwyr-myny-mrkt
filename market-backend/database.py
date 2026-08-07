"""MongoDB connection module — replaces SQLAlchemy/PostgreSQL.

Uses PyMongo (sync) so existing route functions keep their `def` signatures.
Falls back to mongomock (in-memory) when the real MongoDB is unreachable,
so the app works for development/demo without an external database.
"""
import os
import logging

logger = logging.getLogger(__name__)

from pymongo import ASCENDING, DESCENDING
from pymongo.database import Database

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "market_db")
# Only fall back to in-memory mongomock when explicitly allowed (dev/demo mode).
# In production, a bad MONGO_URL must fail fast rather than silently lose data.
_ALLOW_MONGOMOCK = os.environ.get("ALLOW_MONGOMOCK", "false").lower() in ("1", "true", "yes")

_client = None
db: Database = None

def _try_real_mongo():
    """Try to connect to the real MongoDB and ping it."""
    if not MONGO_URL:
        raise ValueError("MONGO_URL not set")
    from pymongo import MongoClient
    client = MongoClient(MONGO_URL, uuidRepresentation="standard", tz_aware=True,
                         serverSelectionTimeoutMS=5000, connectTimeoutMS=5000)
    # Force a real connection attempt
    client[DB_NAME].command("ping")
    return client

def _use_mock_mongo():
    """Fall back to mongomock (in-memory) database."""
    import mongomock
    logger.warning("⚠️  Using in-memory mongomock — data will NOT persist across restarts")
    client = mongomock.MongoClient(uuidRepresentation="standard", tz_aware=True)
    return client

try:
    _client = _try_real_mongo()
    logger.info("✅ Connected to real MongoDB")
except Exception as exc:
    if _ALLOW_MONGOMOCK:
        logger.warning(f"Real MongoDB unavailable ({exc}), falling back to in-memory mongomock")
        _client = _use_mock_mongo()
    else:
        logger.error(
            f"MongoDB connection failed: {exc}. "
            "Set ALLOW_MONGOMOCK=true to use in-memory fallback in dev/demo mode."
        )
        raise

db: Database = _client[DB_NAME]


def get_db() -> Database:
    """FastAPI dependency that yields the MongoDB database handle."""
    return db


def get_client():
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
    try:
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
        db[C.day_closes].create_index([("close_date", ASCENDING)], unique=True)
        # Batch inventory indexes
        db[C.product_batches].create_index([("product_id", ASCENDING), ("purchase_date", ASCENDING)])
        db[C.product_batches].create_index([("supplier_id", ASCENDING)])
        db[C.product_batches].create_index([("is_exhausted", ASCENDING)])
        db[C.product_batches].create_index([("batch_no", ASCENDING)], unique=True, sparse=True)
        db[C.sale_items].create_index([("unit_cost", ASCENDING)])
        db[C.sale_items].create_index([("created_at", DESCENDING)])
    except Exception as e:
        logger.warning(f"Index creation skipped: {e}")
