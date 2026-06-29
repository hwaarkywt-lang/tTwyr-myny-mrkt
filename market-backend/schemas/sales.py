"""Pydantic schemas for POS sales."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from models import SaleStatus


class SaleItemIn(BaseModel):
    product_id: str
    quantity: Decimal = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)
    discount: Decimal = Decimal("0")
    tax: Decimal = Decimal("0")


class SaleCreate(BaseModel):
    customer_id: Optional[str] = None
    shift_id: Optional[str] = None
    items: List[SaleItemIn] = Field(..., min_length=1)
    payment_method: str = "cash"
    notes: Optional[str] = None


class SaleItemOut(BaseModel):
    id: str
    product_id: str
    product_name: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    discount: Decimal
    tax: Decimal
    total: Decimal

    class Config:
        from_attributes = True


class SaleOut(BaseModel):
    id: str
    invoice_no: str
    cashier_id: str
    customer_id: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total: Decimal
    paid_amount: Decimal
    change_amount: Decimal
    payment_method: str
    status: SaleStatus
    items: List[SaleItemOut] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ShiftOpen(BaseModel):
    opening_cash: Decimal = Decimal("0")
    notes: Optional[str] = None


class ShiftClose(BaseModel):
    closing_cash: Decimal
    notes: Optional[str] = None


class ShiftOut(BaseModel):
    id: str
    cashier_id: str
    opened_at: datetime
    closed_at: Optional[datetime]
    opening_cash: Decimal
    closing_cash: Optional[Decimal]
    expected_cash: Optional[Decimal]
    variance: Optional[Decimal]
    status: str
    notes: Optional[str]

    class Config:
        from_attributes = True
