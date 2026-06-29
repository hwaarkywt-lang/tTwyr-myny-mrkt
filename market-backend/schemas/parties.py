"""Pydantic schemas for customers and suppliers."""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime
from decimal import Decimal


class CustomerCreate(BaseModel):
    code: Optional[str] = None
    full_name: str = Field(..., min_length=1, max_length=120)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    credit_limit: Decimal = Decimal("0")


class CustomerUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    credit_limit: Optional[Decimal] = None
    is_active: Optional[bool] = None


class CustomerOut(BaseModel):
    id: str
    code: Optional[str]
    full_name: str
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    credit_limit: Decimal
    balance: Decimal
    loyalty_points: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SupplierCreate(BaseModel):
    code: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=120)
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierOut(BaseModel):
    id: str
    code: Optional[str]
    name: str
    contact_person: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    balance: Decimal
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
