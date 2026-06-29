"""Pydantic schemas for expenses."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = None


class ExpenseCategoryOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ExpenseCreate(BaseModel):
    category_id: Optional[str] = None
    amount: Decimal = Field(..., gt=0)
    description: Optional[str] = None
    paid_to: Optional[str] = None
    payment_method: str = "cash"
    expense_date: Optional[date] = None


class ExpenseOut(BaseModel):
    id: str
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    amount: Decimal
    description: Optional[str] = None
    paid_to: Optional[str] = None
    payment_method: str = "cash"
    expense_date: Optional[date] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
