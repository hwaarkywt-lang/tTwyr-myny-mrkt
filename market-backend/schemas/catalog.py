"""Pydantic schemas for product catalog."""
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    parent_id: Optional[str] = None
    description: Optional[str] = None


class CategoryOut(BaseModel):
    id: str
    name: str
    parent_id: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class BarcodeCreate(BaseModel):
    barcode: str
    is_primary: bool = False
    pack_size: int = 1


class BarcodeOut(BaseModel):
    id: str
    barcode: str
    is_primary: bool
    pack_size: int

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    sku: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    category_id: Optional[str] = None
    unit: str = "piece"
    cost_price: Decimal = Decimal("0")
    sale_price: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")
    min_stock_level: int = 0
    max_stock_level: Optional[int] = None
    current_stock: Decimal = Decimal("0")
    has_expiry: bool = False
    expiry_date: Optional[date] = None
    is_featured: bool = False
    featured_order: int = 0
    image_url: Optional[str] = None
    barcodes: List[str] = []

    @model_validator(mode="after")
    def _expiry_required_when_has_expiry(self):
        if self.has_expiry and self.expiry_date is None:
            raise ValueError("تاريخ الصلاحية مطلوب عندما يكون المنتج له صلاحية")
        return self


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    unit: Optional[str] = None
    cost_price: Optional[Decimal] = None
    sale_price: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = None
    min_stock_level: Optional[int] = None
    max_stock_level: Optional[int] = None
    has_expiry: Optional[bool] = None
    expiry_date: Optional[date] = None
    is_featured: Optional[bool] = None
    featured_order: Optional[int] = None
    is_active: Optional[bool] = None
    image_url: Optional[str] = None

    @model_validator(mode="after")
    def _expiry_required_when_has_expiry(self):
        # If both fields provided in the same PATCH, enforce consistency.
        if self.has_expiry is True and self.expiry_date is None:
            raise ValueError("تاريخ الصلاحية مطلوب عندما يكون المنتج له صلاحية")
        return self


class ProductOut(BaseModel):
    id: str
    sku: str
    name: str
    description: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    unit: str
    cost_price: Decimal
    sale_price: Decimal
    tax_rate: Decimal
    min_stock_level: int
    max_stock_level: Optional[int] = None
    current_stock: Decimal
    has_expiry: bool
    expiry_date: Optional[date] = None
    is_featured: bool = False
    featured_order: int = 0
    is_active: bool
    image_url: Optional[str] = None
    barcodes: List[str] = []
    created_at: datetime

    class Config:
        from_attributes = True
