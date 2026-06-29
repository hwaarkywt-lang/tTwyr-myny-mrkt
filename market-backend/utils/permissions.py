from functools import wraps
from fastapi import HTTPException, status, Request
from typing import List
from models.user import UserRole

# Define permissions for each role
ROLE_PERMISSIONS = {
    UserRole.OWNER: [
        "view_all",
        "create_all",
        "edit_all",
        "delete_all",
        "view_profits",
        "manage_users",
        "manage_settings",
        "view_reports",
        "export_data"
    ],
    UserRole.SUPERVISOR: [
        "view_all",
        "create_products",
        "edit_products",
        "create_sales",
        "view_customers",
        "create_customers",
        "edit_customers",
        "view_suppliers",
        "create_suppliers",
        "view_reports",
        "view_profits"
    ],
    UserRole.EMPLOYEE: [
        "view_products",
        "create_sales",
        "view_customers"
    ]
}

# Forbidden actions for Employee (Cashier)
EMPLOYEE_FORBIDDEN = [
    "edit_prices",
    "delete_products",
    "edit_products",
    "edit_stock",
    "delete_invoices",
    "view_profits",
    "manage_users",
    "manage_settings"
]

def check_permission(user_role: str, required_permission: str) -> bool:
    """Check if a user role has a specific permission"""
    if user_role == UserRole.OWNER:
        return True
    
    role_perms = ROLE_PERMISSIONS.get(user_role, [])
    return required_permission in role_perms

def require_permission(permission: str):
    """Decorator to require a specific permission"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get current user from request
            request = kwargs.get('request')
            if not request or not hasattr(request.state, 'user'):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="غير مصرح به"
                )
            
            user = request.state.user
            if not check_permission(user['role'], permission):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="ليس لديك صلاحية لهذه العملية"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

def require_roles(allowed_roles: List[str]):
    """Decorator to require specific roles"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request = kwargs.get('request')
            if not request or not hasattr(request.state, 'user'):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="غير مصرح به"
                )
            
            user = request.state.user
            if user['role'] not in allowed_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="ليس لديك صلاحية لهذه العملية"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator
