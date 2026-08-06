---
name: MiniMarket backend gaps fixed
description: Supplier debt bug, dashboard KPIs, POS redesign, returns page changes
---

## Supplier balance calculation (parties.py get_supplier)

**Rule:** Only credit purchases generate debt. Cash purchases do NOT.

**Why:** Cash is settled immediately at purchase time. The original code summed ALL purchases in `total_purchases`, but `total_paid` only counted payments from `supplier_payments` collection — missing the instant cash payment, creating artificial debt.

**How to apply:**
```python
# CORRECT — only credit purchases in debt base
total_credit_unpaid = sum(
    float(p.get("total", 0)) - float(p.get("paid_amount", 0))
    for p in all_purchases
    if p.get("payment_method", "credit") == "credit"
)
computed_balance = total_credit_unpaid - total_paid - total_returns
# NOTE: No max(0, ...) clamp — negative balance = supplier credit / overpayment is valid
```

## Dashboard.jsx — KPI cards scope

Removed: products_count, stock_value, المنتجات card.
Kept: sales_today, sales_today_cash, sales_today_credit, sales_month, invoices_today, customers_count.
Low-stock: shown as alert banner only (not a count stat). No product inventory stats.

## Returns.jsx — no create button

Create button fully removed. Replaced with amber banner:
"إنشاء المرتجعات يتم من نقطة البيع أو حسابات التجار فقط"
Added 4 stat cards: returns count/value today + this month.
These stats are computed client-side from the full approved returns list (no dedicated backend endpoint).

## POS.jsx — redesign (dark theme)

Complete rewrite. Layout: 3-column flex RTL (invoice panel right, products grid center, featured left).
Dark background: bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950.
Height: calc(100vh - 60px) so it fills the viewport.
Payment methods: 2-row grid (4+3).
Backend endpoints used: /pos/products, /products/by-barcode/{barcode}, /sales, /customers, /sales-returns/instant via PosReturnsDialog.

## sales_returns.py instant return

/sales-returns/instant (POST) is auto-approved and updates stock immediately.
Requires require_cashier level (cashier, manager, admin all work).
The "فشل" error from POS was in the frontend toast handler — backend is correct.

## Arithmetic/calculation audit fixes (2026-08-06)

**Rule:** Several calculation bugs were identified and fixed across the system.

**Fixes applied:**

1. `routes/reports.py` — `_date_range` and daily queries used naive datetimes; added `.replace(tzinfo=timezone.utc)` so queries match UTC-stored records.

2. `routes/day_close.py` — `expected_cash` was subtracting ALL expenses, including card/bank ones. Fixed to filter expenses by `payment_method: {$in: ["cash", None, ""]}`. Also added `total_expenses_all` for the `net` field. The `net` now uses all-method expenses (correct P&L), while `expected_cash` uses cash-only.

3. `routes/sales.py` — Added per-item discount/tax calculation (line_discount = qty*price*discount%/100, line_tax on post-discount amount). Added `tendered_amount` field to SaleCreate; backend now calculates `change_amount = tendered - total` and rejects if tender < total. Total rounded to 2 decimal places.

4. `routes/dashboard.py` — Returns today/month KPI totals were including pending/rejected returns. Fixed to filter `status: "approved"` only.

5. `schemas/sales.py` — Added `tendered_amount: Optional[Decimal] = None` to SaleCreate.

6. `DayClose.jsx` — History table showed blank dates because it read `d.business_date` but backend returns `d.close_date`. Fixed.

7. `DayClose.jsx` — Notes validation: if variance ≠ 0, notes are now required before submitting day close.

8. `Purchases.jsx` — `totalDue` was summing all supplier balances including negative credits. Fixed to `Math.max(0, balance)` so credits don't reduce the "total due" figure.

9. `POS.jsx` — `setQtyDirect` had no stock cap; added clamp to `item.stock` with warning toast. Added tendered amount input and live change display for cash payments; sends `tendered_amount` in sale payload.
