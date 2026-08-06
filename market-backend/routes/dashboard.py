"""Dashboard summary endpoints — MongoDB."""
from datetime import datetime, timezone, timedelta, date as _date
from fastapi import APIRouter, Depends
from database import get_db, C
from utils.deps import get_current_user, require_manager

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _today_range():
    today = _date.today()
    start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
    end = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc)
    return start, end


def _month_range():
    today = _date.today()
    start = datetime(today.year, today.month, 1, tzinfo=timezone.utc)
    if today.month == 12:
        end = datetime(today.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(today.year, today.month + 1, 1, tzinfo=timezone.utc)
    return start, end


def _sum_sales(db, start, end):
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end},
                    "status": "completed", "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]
    a = list(db[C.sales].aggregate(pipeline))
    return (a[0]["total"], a[0]["count"]) if a else (0, 0)


def _sum_purchases(db, start, end):
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lt": end}, "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]
    a = list(db[C.purchases].aggregate(pipeline))
    return (a[0]["total"], a[0]["count"]) if a else (0, 0)


def _sum_expenses(db, start, end):
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lt": end}, "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    a = list(db[C.expenses].aggregate(pipeline))
    return a[0]["total"] if a else 0


@router.get("/summary")
def dashboard_summary(db = Depends(get_db), current = Depends(get_current_user)):
    today_start, today_end = _today_range()
    month_start, month_end = _month_range()

    sales_today, invoices_today = _sum_sales(db, today_start, today_end)
    sales_month, invoices_month = _sum_sales(db, month_start, month_end)
    purchases_today, _ = _sum_purchases(db, today_start, today_end + timedelta(microseconds=1))
    purchases_month, _ = _sum_purchases(db, month_start, month_end)
    expenses_month = _sum_expenses(db, month_start, month_end)

    # Sales breakdown: cash (all non-credit methods) vs credit (آجل)
    by_method_today = list(db[C.sales].aggregate([
        {"$match": {"created_at": {"$gte": today_start, "$lte": today_end},
                    "status": "completed", "deleted_at": None}},
        {"$group": {"_id": "$payment_method",
                    "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]))
    sales_today_cash   = sum(float(x["total"]) for x in by_method_today if x["_id"] != "credit")
    sales_today_credit = sum(float(x["total"]) for x in by_method_today if x["_id"] == "credit")

    products_count = db[C.products].count_documents({"deleted_at": None, "is_active": True})
    customers_count = db[C.customers].count_documents({"deleted_at": None})
    suppliers_count = db[C.suppliers].count_documents({"deleted_at": None})
    # Server-side low stock count using $expr (avoids client-side iteration)
    low_stock_count = db[C.products].count_documents({
        "deleted_at": None, "is_active": True,
        "$expr": {"$lte": ["$current_stock", "$min_stock_level"]},
    })

    # Expiring within 30 days
    soon = datetime.now(timezone.utc) + timedelta(days=30)
    expiring_soon = db[C.products].count_documents({
        "deleted_at": None, "is_active": True,
        "expiry_date": {"$ne": None, "$lte": soon},
    })

    return {
        "sales_today": sales_today, "invoices_today": invoices_today,
        "sales_today_cash": round(sales_today_cash, 2),
        "sales_today_credit": round(sales_today_credit, 2),
        "sales_month": sales_month, "invoices_month": invoices_month,
        "purchases_today": purchases_today, "purchases_month": purchases_month,
        "expenses_month": expenses_month,
        "products_count": products_count,
        "customers_count": customers_count,
        "suppliers_count": suppliers_count,
        "low_stock_count": low_stock_count,
        "expiring_soon_count": expiring_soon,
    }


@router.get("/manager")
def manager_dashboard(db = Depends(get_db), _u = Depends(require_manager)):
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    today = _date.today()
    week_start = datetime.combine(today - timedelta(days=today.weekday()),
                                   datetime.min.time()).replace(tzinfo=timezone.utc)
    month_start, month_end = _month_range()
    year_start = datetime(today.year, 1, 1, tzinfo=timezone.utc)
    year_end = datetime(today.year + 1, 1, 1, tzinfo=timezone.utc)
    today_start, today_end = _today_range()

    def sum_sales(start, end):
        return _sum_sales(db, start, end)[0]

    def sum_purchases(start, end):
        return _sum_purchases(db, start, end)[0]

    def count_purchases(start, end):
        return db[C.purchases].count_documents({
            "created_at": {"$gte": start, "$lt": end}, "deleted_at": None,
        })

    def sum_expenses(start, end):
        return _sum_expenses(db, start, end)

    # Sales today: cash (all non-credit methods) vs credit (آجل)
    today_invoices_count, _ = _sum_sales(db, today_start, today_end)[0], 0
    today_invoices_count = _sum_sales(db, today_start, today_end)[1]
    by_method_today = list(db[C.sales].aggregate([
        {"$match": {"created_at": {"$gte": today_start, "$lte": today_end},
                    "status": "completed", "deleted_at": None}},
        {"$group": {"_id": "$payment_method",
                    "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]))
    today_cash_total   = round(sum(float(x["total"]) for x in by_method_today if x["_id"] != "credit"), 2)
    today_credit_total = round(sum(float(x["total"]) for x in by_method_today if x["_id"] == "credit"), 2)

    # Sales by period
    sales = {
        "today": sum_sales(today_start, today_end),
        "week": sum_sales(week_start, today_end),
        "month": sum_sales(month_start, month_end),
        "year": sum_sales(year_start, year_end),
        "today_cash": today_cash_total,
        "today_credit": today_credit_total,
        "invoices_today": today_invoices_count,
    }

    # Profits = revenue - cost (approximate, per item)
    def profit_for(start, end):
        sale_ids = [s["_id"] for s in db[C.sales].find({
            "created_at": {"$gte": start, "$lte": end},
            "status": "completed", "deleted_at": None,
        }, {"_id": 1})]
        if not sale_ids:
            return 0
        items = list(db[C.sale_items].find({"sale_id": {"$in": sale_ids}}))
        if not items:
            return 0
        product_ids = list({it["product_id"] for it in items})
        prod_map = {p["_id"]: p for p in
                    db[C.products].find({"_id": {"$in": product_ids}}, {"cost_price": 1})}
        rev = sum(float(it.get("total", 0)) for it in items)
        cost = sum(float(prod_map.get(it["product_id"], {}).get("cost_price", 0) or 0)
                   * float(it.get("quantity", 0)) for it in items)
        return rev - cost

    profits = {
        "today": profit_for(today_start, today_end),
        "week": profit_for(week_start, today_end),
        "month": profit_for(month_start, month_end),
        "year": profit_for(year_start, year_end),
    }

    purchases = {
        "today_total": sum_purchases(today_start, today_end + timedelta(microseconds=1)),
        "week_total": sum_purchases(week_start, today_end + timedelta(microseconds=1)),
        "month_total": sum_purchases(month_start, month_end),
        "year_total": sum_purchases(year_start, year_end),
        "today_count": count_purchases(today_start, today_end + timedelta(microseconds=1)),
        "month_count": count_purchases(month_start, month_end),
        "today_products_added": 0,
        "month_products_added": 0,
    }
    # Distinct products purchased today
    purchases["today_products_added"] = len(set(
        i["product_id"] for s in db[C.purchases].find({
            "created_at": {"$gte": today_start, "$lte": today_end}, "deleted_at": None,
        }, {"_id": 1})
        for i in db[C.purchase_items].find({"purchase_id": s["_id"]}, {"product_id": 1})
    ))
    purchases["month_products_added"] = len(set(
        i["product_id"] for s in db[C.purchases].find({
            "created_at": {"$gte": month_start, "$lt": month_end}, "deleted_at": None,
        }, {"_id": 1})
        for i in db[C.purchase_items].find({"purchase_id": s["_id"]}, {"product_id": 1})
    ))

    # Cash box (simplified)
    cash_sales_today = 0.0
    for s in db[C.sales].find({
        "created_at": {"$gte": today_start, "$lte": today_end},
        "status": "completed", "payment_method": "cash", "deleted_at": None,
    }, {"total": 1}):
        cash_sales_today += float(s.get("total", 0))
    customer_receipts = sum(float(p.get("amount", 0)) for p in db[C.customer_payments].find({
        "created_at": {"$gte": today_start, "$lte": today_end},
    }, {"amount": 1}))
    expenses_paid_today = sum_expenses(today_start, today_end + timedelta(microseconds=1))
    supplier_paid_today = sum(float(p.get("amount", 0)) for p in db[C.supplier_payments].find({
        "created_at": {"$gte": today_start, "$lte": today_end},
    }, {"amount": 1}))
    cash_box = {
        "current_balance": cash_sales_today + customer_receipts - expenses_paid_today - supplier_paid_today,
        "total_received_today": cash_sales_today + customer_receipts,
        "sales_cash": cash_sales_today,
        "customer_receipts": customer_receipts,
        "total_paid_today": expenses_paid_today + supplier_paid_today,
        "expenses_paid": expenses_paid_today,
        "supplier_paid": supplier_paid_today,
    }

    # Alerts
    over_credit = []
    for c in db[C.customers].find({"deleted_at": None,
                                    "credit_limit": {"$gt": 0}}, {"_id": 1, "full_name": 1, "balance": 1, "credit_limit": 1}):
        if float(c.get("balance", 0)) > float(c.get("credit_limit", 0)):
            over_credit.append({"id": c["_id"], "full_name": c["full_name"],
                                 "balance": c.get("balance", 0),
                                 "credit_limit": c.get("credit_limit", 0)})
    suppliers_overdue = []
    for s in db[C.suppliers].find({"deleted_at": None, "balance": {"$gt": 0}},
                                   {"_id": 1, "name": 1, "balance": 1}):
        suppliers_overdue.append({"id": s["_id"], "name": s["name"],
                                   "balance": s.get("balance", 0)})

    low_stock = []
    out_of_stock = []
    # Server-side filter for low-stock / out-of-stock products
    low_or_out = list(db[C.products].find({
        "deleted_at": None, "is_active": True,
        "$expr": {"$lte": ["$current_stock", "$min_stock_level"]},
    }, {"_id": 1, "name": 1, "current_stock": 1, "min_stock_level": 1}).limit(100))
    for p in low_or_out:
        cs = float(p.get("current_stock", 0) or 0)
        ms = float(p.get("min_stock_level", 0) or 0)
        if cs <= 0:
            out_of_stock.append({"id": p["_id"], "name": p["name"]})
        else:
            low_stock.append({"id": p["_id"], "name": p["name"],
                               "current_stock": cs, "min_stock_level": ms})

    soon = now + timedelta(days=30)
    expiring_soon = []
    for p in db[C.products].find({
        "deleted_at": None, "is_active": True,
        "expiry_date": {"$ne": None, "$lte": soon},
    }, {"_id": 1, "name": 1, "expiry_date": 1}):
        ed = p["expiry_date"]
        ed_d = ed.date() if hasattr(ed, "date") else ed
        expiring_soon.append({"id": p["_id"], "name": p["name"],
                               "expiry_date": ed_d.isoformat()})

    # Counts + top
    top_debtors = sorted(
        [{"id": c["_id"], "full_name": c["full_name"], "balance": float(c.get("balance", 0))}
         for c in db[C.customers].find({"deleted_at": None, "balance": {"$gt": 0}},
                                        {"_id": 1, "full_name": 1, "balance": 1})],
        key=lambda x: x["balance"], reverse=True,
    )[:10]
    customers_total_debt = round(sum(c["balance"] for c in top_debtors), 2)
    customers = {
        "count": db[C.customers].count_documents({"deleted_at": None}),
        "balance_total": customers_total_debt,
        # aliases expected by ManagerDashboard.jsx
        "total_debt": customers_total_debt,
        "debtors_count": len(top_debtors),
        "top_debtors": top_debtors,
    }
    top_suppliers = sorted(
        [{"id": s["_id"], "name": s["name"], "balance": float(s.get("balance", 0))}
         for s in db[C.suppliers].find({"deleted_at": None, "balance": {"$gt": 0}},
                                        {"_id": 1, "name": 1, "balance": 1})],
        key=lambda x: x["balance"], reverse=True,
    )[:10]
    suppliers_total_due = round(sum(s["balance"] for s in top_suppliers), 2)
    suppliers = {
        "count": db[C.suppliers].count_documents({"deleted_at": None}),
        "balance_total": suppliers_total_due,
        # aliases expected by ManagerDashboard.jsx
        "total_due": suppliers_total_due,
        "due_count": len(top_suppliers),
        "top_suppliers": top_suppliers,
    }
    # Top selling / top profit / least selling for ManagerDashboard product lists
    top_pipeline = [
        {"$lookup": {"from": "sales", "localField": "sale_id",
                      "foreignField": "_id", "as": "sale"}},
        {"$unwind": "$sale"},
        {"$match": {"sale.created_at": {"$gte": month_start, "$lt": month_end},
                    "sale.status": "completed", "sale.deleted_at": None}},
        {"$group": {"_id": "$product_id",
                     "quantity": {"$sum": "$quantity"},
                     "revenue": {"$sum": "$total"}}},
    ]
    sold = list(db[C.sale_items].aggregate(top_pipeline))
    # Pre-fetch all products needed for sold-item resolution (avoids N+1)
    sold_ids = [r["_id"] for r in sold]
    prod_meta = {p["_id"]: p for p in db[C.products].find(
        {"_id": {"$in": sold_ids}}, {"name": 1, "cost_price": 1, "sale_price": 1})}

    def _resolve(rows, key, desc=True, limit=10):
        rows = sorted(rows, key=lambda r: r.get(key, 0) or 0, reverse=desc)[:limit]
        out = []
        for r in rows:
            p = prod_meta.get(r["_id"], {})
            profit = r.get("revenue", 0) - float(p.get("cost_price", 0) or 0) * float(r.get("quantity", 0))
            out.append({
                "id": r["_id"], "name": p.get("name", "?"),
                "quantity": r.get("quantity", 0),
                "revenue": r.get("revenue", 0), "profit": profit,
            })
        return out
    top_selling = _resolve(sold, "quantity", desc=True)
    # For top_profit we need to compute profit per row first, then sort by it.
    sold_with_profit = []
    for s in sold:
        p = prod_meta.get(s["_id"], {})
        profit = s.get("revenue", 0) - float(p.get("cost_price", 0) or 0) * float(s.get("quantity", 0))
        sold_with_profit.append({**s, "profit": profit})
    top_profit = _resolve(sold_with_profit, "profit", desc=True)
    # Least selling = sold items with lowest qty (Phase B candidate: include never-sold)
    least_selling = _resolve(sold, "quantity", desc=False)
    products = {
        "count": db[C.products].count_documents({"deleted_at": None, "is_active": True}),
        "top_selling": top_selling,
        "top_profit": top_profit,
        "least_selling": least_selling,
    }

    # Returns summary — only approved returns for financial totals
    returns_today_agg = list(db[C.sale_returns].aggregate([
        {"$match": {"created_at": {"$gte": today_start, "$lte": today_end},
                    "status": "approved", "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]))
    returns_month_agg = list(db[C.sale_returns].aggregate([
        {"$match": {"created_at": {"$gte": month_start, "$lt": month_end},
                    "status": "approved", "deleted_at": None}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]))
    returns = {
        "today_total": returns_today_agg[0]["total"] if returns_today_agg else 0,
        "today_count": returns_today_agg[0]["count"] if returns_today_agg else 0,
        "month_total": returns_month_agg[0]["total"] if returns_month_agg else 0,
        "month_count": returns_month_agg[0]["count"] if returns_month_agg else 0,
        "pending_count": db[C.sale_returns].count_documents({"status": "pending", "deleted_at": None}),
        "approved_count": db[C.sale_returns].count_documents({"status": "approved", "deleted_at": None}),
        "rejected_count": db[C.sale_returns].count_documents({"status": "rejected", "deleted_at": None}),
    }

    # Expenses summary + by-category breakdown for pie chart
    exp_cat_pipeline = [
        {"$match": {"created_at": {"$gte": month_start, "$lt": month_end}, "deleted_at": None}},
        {"$group": {"_id": "$category_id", "total": {"$sum": "$amount"}}},
        {"$sort": {"total": -1}},
    ]
    exp_categories = []
    exp_raw = list(db[C.expenses].aggregate(exp_cat_pipeline))
    if exp_raw:
        exp_cat_ids = [r["_id"] for r in exp_raw if r["_id"]]
        cat_map = {c["_id"]: c for c in
                   db[C.expense_categories].find({"_id": {"$in": exp_cat_ids}})}
        for r in exp_raw:
            cat = cat_map.get(r["_id"]) if r["_id"] else None
            exp_categories.append({"name": cat["name"] if cat else "بدون تصنيف",
                                    "category": cat["name"] if cat else "بدون تصنيف",
                                    "total": r["total"]})
    expenses_today = sum_expenses(today_start, today_end + timedelta(microseconds=1))
    expenses_month = sum_expenses(month_start, month_end)
    expenses_total = sum_expenses(
        datetime(2000, 1, 1, tzinfo=timezone.utc), now
    )
    expenses = {
        "today": expenses_today,
        "month": expenses_month,
        "total": expenses_total,
        "categories": exp_categories,
    }

    # Sales chart — last 30 days (renamed to chart_30d to match frontend)
    chart_pipeline = [
        {"$match": {"created_at": {"$gte": now - timedelta(days=30), "$lte": now},
                    "status": "completed", "deleted_at": None}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "sales": {"$sum": "$total"},
        }},
        {"$sort": {"_id": 1}},
    ]
    # Expenses chart — last 30 days
    exp_chart_pipeline = [
        {"$match": {"created_at": {"$gte": now - timedelta(days=30), "$lte": now},
                    "deleted_at": None}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "expenses": {"$sum": "$amount"},
        }},
    ]
    sales_by_day = {r["_id"]: r["sales"] for r in db[C.sales].aggregate(chart_pipeline)}
    exp_by_day   = {r["_id"]: r["expenses"] for r in db[C.expenses].aggregate(exp_chart_pipeline)}
    # Build a complete 30-day series
    all_days = sorted(set(list(sales_by_day.keys()) + list(exp_by_day.keys())))
    chart_30d = []
    for d in all_days:
        s = float(sales_by_day.get(d, 0))
        e = float(exp_by_day.get(d, 0))
        chart_30d.append({"date": d, "sales": s, "expenses": e, "profit": s - e})

    # Payment methods breakdown — current month
    pm_pipeline = [
        {"$match": {"created_at": {"$gte": month_start, "$lt": month_end},
                    "status": "completed", "deleted_at": None}},
        {"$group": {"_id": "$payment_method", "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]
    payment_methods = [{"method": r["_id"], "total": r["total"], "count": r["count"]}
                       for r in db[C.sales].aggregate(pm_pipeline)]

    return {
        "as_of": now.isoformat(),
        "alerts": {
            "over_credit_limit": over_credit,
            "suppliers_overdue": suppliers_overdue,
            "low_stock": low_stock,
            "out_of_stock": out_of_stock,
            "expiring_soon": expiring_soon,
        },
        "sales": sales, "profits": profits, "purchases": purchases,
        "cash_box": cash_box,
        "customers": customers, "suppliers": suppliers, "products": products,
        "returns": returns, "expenses": expenses,
        "chart_30d": chart_30d,
        "payment_methods": payment_methods,
    }
