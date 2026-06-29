from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date

class SaleItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price: float
    total: float

class Sale(BaseModel):
    id: Optional[str] = None
    invoice_number: str
    date: date
    time: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: List[SaleItem]
    subtotal: float
    discount: float = 0
    net_total: float
    payment_method: str
    status: str = "مكتمل"
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

class SaleCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: List[SaleItem]
    discount: float = 0
    payment_method: str

class Purchase(BaseModel):
    id: Optional[str] = None
    purchase_number: str
    date: date
    supplier_id: str
    supplier_name: str
    items: List[SaleItem]
    total: float
    paid: float
    remaining: float
    status: str
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

class PurchaseCreate(BaseModel):
    supplier_id: str
    supplier_name: str
    items: List[SaleItem]
    paid: float
