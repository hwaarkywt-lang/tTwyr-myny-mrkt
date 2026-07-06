---
name: MiniMarket backend gaps fixed
description: What was broken and how it was fixed in the first complete session
---

**Vite proxy:** Added `/api` → `http://localhost:8080` proxy in vite.config.ts so relative `/api/...` calls from the frontend reach the backend (different ports: 21902 vs 8080).

**Sales returns workflow:** Rewrote routes/sales_returns.py.
- POST /api/sales-returns now creates PENDING returns (manager must approve)
- POST /api/sales-returns/{id}/approve — atomic conditional update (status=pending guard), restores stock, adjusts credit customer balance
- POST /api/sales-returns/{id}/reject — atomic conditional update, cleans up pending items
- GET /api/sales-returns?status= supports status filter + enriched response (invoice_no, customer_name, items[], creator_name)
- Return quantity guard uses _already_returned_qty() to prevent over-returns across multiple requests

**Day close:** Rewrote routes/day_close.py.
- POST /api/day-closes accepts {business_date, actual_cash, notes}, idempotency via find_one + unique index
- Preview shape now includes expected_cash, sales_cash, customer_receipts, expenses_paid, supplier_paid, cash_returns, already_closed, closed_at

**Dashboard manager:** Added total_debt/debtors_count aliases to customers{}, total_due/due_count aliases to suppliers{} to match ManagerDashboard.jsx field names.
