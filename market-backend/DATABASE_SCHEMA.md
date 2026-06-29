# قاعدة بيانات نظام ميني ماركت الفنية
## Database Schema & ERD Documentation

---

## 🗂️ **الجداول الرئيسية (Main Tables)**

### 1️⃣ **Users (المستخدمون)**
```sql
users
├── id (PK, UUID)
├── email (UNIQUE, NOT NULL)
├── password (HASHED, NOT NULL)
├── name (NOT NULL)
├── phone (NOT NULL)
├── role_id (FK → roles.id)
├── status (ENUM: active, inactive)
├── created_at
├── updated_at
└── last_login
```

### 2️⃣ **Roles (الأدوار)**
```sql
roles
├── id (PK, UUID)
├── name (UNIQUE, NOT NULL) -- مدير، مشرف، كاشير، أمين مخزون
├── description
├── created_at
└── updated_at
```

### 3️⃣ **Permissions (الصلاحيات)**
```sql
permissions
├── id (PK, UUID)
├── name (UNIQUE, NOT NULL)
├── module (NOT NULL) -- SALES, PRODUCTS, INVENTORY, etc.
├── action (NOT NULL) -- CREATE, READ, UPDATE, DELETE, APPROVE
├── description
└── created_at
```

### 4️⃣ **Role_Permissions (صلاحيات الأدوار)**
```sql
role_permissions
├── id (PK, UUID)
├── role_id (FK → roles.id)
├── permission_id (FK → permissions.id)
└── created_at
```

---

## 📦 **المنتجات والتصنيفات**

### 5️⃣ **Categories (تصنيفات المنتجات)**
```sql
categories
├── id (PK, UUID)
├── name (UNIQUE, NOT NULL)
├── parent_id (FK → categories.id, NULLABLE) -- للتصنيفات الفرعية
├── description
├── is_active (BOOLEAN, DEFAULT TRUE)
├── created_at
└── updated_at
```

### 6️⃣ **Units (وحدات القياس)**
```sql
units
├── id (PK, UUID)
├── name (UNIQUE, NOT NULL) -- قطعة، كرتون، كيلو، لتر
├── symbol (UNIQUE)
├── is_active (BOOLEAN, DEFAULT TRUE)
└── created_at
```

### 7️⃣ **Products (المنتجات)**
```sql
products
├── id (PK, UUID)
├── name (NOT NULL, INDEXED)
├── category_id (FK → categories.id)
├── unit_id (FK → units.id)
├── purchase_price (DECIMAL, NOT NULL)
├── sale_price (DECIMAL, NOT NULL)
├── stock (INTEGER, DEFAULT 0)
├── min_stock (INTEGER, DEFAULT 0)
├── max_stock (INTEGER)
├── expiry_date (DATE, NULLABLE)
├── supplier_id (FK → suppliers.id)
├── description (TEXT)
├── image_url (TEXT)
├── sku (UNIQUE)
├── is_active (BOOLEAN, DEFAULT TRUE)
├── is_approved (BOOLEAN, DEFAULT FALSE) -- يحتاج اعتماد المدير
├── is_deleted (BOOLEAN, DEFAULT FALSE) -- Soft Delete
├── approved_by (FK → users.id)
├── approved_at (TIMESTAMP)
├── created_by (FK → users.id)
├── created_at
└── updated_at
```

### 8️⃣ **Product_Barcodes (باركودات المنتجات)**
```sql
product_barcodes
├── id (PK, UUID)
├── product_id (FK → products.id)
├── barcode (UNIQUE, NOT NULL, INDEXED)
├── is_primary (BOOLEAN, DEFAULT FALSE)
├── created_at
└── UNIQUE(product_id, barcode)
```

---

## 👥 **العملاء والموردون**

### 9️⃣ **Customers (العملاء)**
```sql
customers
├── id (PK, UUID)
├── code (UNIQUE, AUTO)
├── name (NOT NULL, INDEXED)
├── phone (NOT NULL, INDEXED)
├── email (UNIQUE)
├── address (TEXT)
├── tax_number (UNIQUE)
├── credit_limit (DECIMAL, DEFAULT 0)
├── total_purchases (DECIMAL, DEFAULT 0)
├── total_payments (DECIMAL, DEFAULT 0)
├── balance (DECIMAL, DEFAULT 0) -- المديونية
├── last_purchase_date (DATE)
├── is_active (BOOLEAN, DEFAULT TRUE)
├── is_deleted (BOOLEAN, DEFAULT FALSE)
├── created_at
└── updated_at
```

### 🔟 **Suppliers (الموردون)**
```sql
suppliers
├── id (PK, UUID)
├── code (UNIQUE, AUTO)
├── name (NOT NULL, INDEXED)
├── phone (NOT NULL)
├── email (UNIQUE)
├── address (TEXT)
├── tax_number (UNIQUE)
├── total_purchases (DECIMAL, DEFAULT 0)
├── total_payments (DECIMAL, DEFAULT 0)
├── balance (DECIMAL, DEFAULT 0) -- المستحقات
├── last_supply_date (DATE)
├── is_active (BOOLEAN, DEFAULT TRUE)
├── is_deleted (BOOLEAN, DEFAULT FALSE)
├── created_at
└── updated_at
```

---

## 🛒 **المبيعات**

### 1️⃣1️⃣ **Sales (المبيعات)**
```sql
sales
├── id (PK, UUID)
├── invoice_number (UNIQUE, AUTO-INCREMENT, NOT NULL)
├── date (DATE, NOT NULL, INDEXED)
├── time (TIME, NOT NULL)
├── customer_id (FK → customers.id, NULLABLE)
├── shift_id (FK → shifts.id, NOT NULL)
├── subtotal (DECIMAL, NOT NULL)
├── discount (DECIMAL, DEFAULT 0)
├── tax (DECIMAL, DEFAULT 0)
├── net_total (DECIMAL, NOT NULL)
├── paid_amount (DECIMAL, NOT NULL)
├── remaining_amount (DECIMAL, DEFAULT 0)
├── payment_method (ENUM: نقداً, آجل, تحويل, بطاقة)
├── payment_status (ENUM: مكتمل, جزئي, غير مدفوع)
├── status (ENUM: مكتمل, ملغي, مرتجع)
├── is_cancelled (BOOLEAN, DEFAULT FALSE)
├── cancellation_reason (TEXT)
├── cancelled_by (FK → users.id)
├── cancelled_at (TIMESTAMP)
├── notes (TEXT)
├── created_by (FK → users.id, NOT NULL)
├── created_at
└── updated_at
```

### 1️⃣2️⃣ **Sale_Items (عناصر المبيعات)**
```sql
sale_items
├── id (PK, UUID)
├── sale_id (FK → sales.id, NOT NULL)
├── product_id (FK → products.id, NOT NULL)
├── product_name (NOT NULL) -- نسخة من الاسم للتاريخ
├── quantity (INTEGER, NOT NULL)
├── unit_price (DECIMAL, NOT NULL)
├── discount (DECIMAL, DEFAULT 0)
├── tax (DECIMAL, DEFAULT 0)
├── total (DECIMAL, NOT NULL)
├── cost_price (DECIMAL) -- لحساب الربح
└── created_at
```

### 1️⃣3️⃣ **Sales_Returns (مرتجع المبيعات)**
```sql
sales_returns
├── id (PK, UUID)
├── return_number (UNIQUE, AUTO-INCREMENT)
├── sale_id (FK → sales.id, NOT NULL)
├── date (DATE, NOT NULL)
├── time (TIME, NOT NULL)
├── customer_id (FK → customers.id)
├── total_amount (DECIMAL, NOT NULL)
├── refund_method (ENUM: نقداً, رصيد)
├── reason (TEXT)
├── status (ENUM: مكتمل, ملغي)
├── created_by (FK → users.id)
├── created_at
└── updated_at
```

### 1️⃣4️⃣ **Sales_Return_Items (عناصر مرتجع المبيعات)**
```sql
sales_return_items
├── id (PK, UUID)
├── return_id (FK → sales_returns.id)
├── product_id (FK → products.id)
├── product_name (NOT NULL)
├── quantity (INTEGER, NOT NULL)
├── unit_price (DECIMAL, NOT NULL)
├── total (DECIMAL, NOT NULL)
└── created_at
```

---

## 📥 **المشتريات**

### 1️⃣5️⃣ **Purchases (المشتريات)**
```sql
purchases
├── id (PK, UUID)
├── purchase_number (UNIQUE, AUTO-INCREMENT)
├── date (DATE, NOT NULL, INDEXED)
├── supplier_id (FK → suppliers.id, NOT NULL)
├── total (DECIMAL, NOT NULL)
├── paid (DECIMAL, DEFAULT 0)
├── remaining (DECIMAL, NOT NULL)
├── payment_status (ENUM: مكتمل, جزئي, غير مدفوع)
├── status (ENUM: قيد الانتظار, معتمد, ملغي)
├── is_approved (BOOLEAN, DEFAULT FALSE)
├── approved_by (FK → users.id)
├── approved_at (TIMESTAMP)
├── is_cancelled (BOOLEAN, DEFAULT FALSE)
├── notes (TEXT)
├── created_by (FK → users.id, NOT NULL)
├── created_at
└── updated_at
```

### 1️⃣6️⃣ **Purchase_Items (عناصر المشتريات)**
```sql
purchase_items
├── id (PK, UUID)
├── purchase_id (FK → purchases.id)
├── product_id (FK → products.id)
├── product_name (NOT NULL)
├── quantity (INTEGER, NOT NULL)
├── unit_price (DECIMAL, NOT NULL)
├── total (DECIMAL, NOT NULL)
└── created_at
```

### 1️⃣7️⃣ **Purchase_Returns (مرتجع المشتريات)**
```sql
purchase_returns
├── id (PK, UUID)
├── return_number (UNIQUE, AUTO-INCREMENT)
├── purchase_id (FK → purchases.id)
├── supplier_id (FK → suppliers.id)
├── date (DATE, NOT NULL)
├── total_amount (DECIMAL, NOT NULL)
├── reason (TEXT)
├── status (ENUM: مكتمل, ملغي)
├── created_by (FK → users.id)
├── created_at
└── updated_at
```

### 1️⃣8️⃣ **Purchase_Return_Items (عناصر مرتجع المشتريات)**
```sql
purchase_return_items
├── id (PK, UUID)
├── return_id (FK → purchase_returns.id)
├── product_id (FK → products.id)
├── product_name (NOT NULL)
├── quantity (INTEGER, NOT NULL)
├── unit_price (DECIMAL, NOT NULL)
├── total (DECIMAL, NOT NULL)
└── created_at
```

---

## 💰 **الدفعات**

### 1️⃣9️⃣ **Payments (الدفعات)**
```sql
payments
├── id (PK, UUID)
├── payment_number (UNIQUE, AUTO-INCREMENT)
├── date (DATE, NOT NULL)
├── type (ENUM: استلام, دفع)
├── customer_id (FK → customers.id, NULLABLE)
├── supplier_id (FK → suppliers.id, NULLABLE)
├── amount (DECIMAL, NOT NULL)
├── payment_method (ENUM: نقداً, تحويل, بطاقة)
├── reference_type (ENUM: sale, purchase, other)
├── reference_id (UUID)
├── notes (TEXT)
├── created_by (FK → users.id)
└── created_at
```

---

## 📊 **المخزون والجرد**

### 2️⃣0️⃣ **Inventory_Movements (حركات المخزون)**
```sql
inventory_movements
├── id (PK, UUID)
├── product_id (FK → products.id, NOT NULL)
├── type (ENUM: IN, OUT, ADJUSTMENT, RETURN)
├── quantity (INTEGER, NOT NULL)
├── quantity_before (INTEGER, NOT NULL)
├── quantity_after (INTEGER, NOT NULL)
├── reference_type (ENUM: sale, purchase, adjustment, inventory_count, return)
├── reference_id (UUID)
├── notes (TEXT)
├── created_by (FK → users.id)
└── created_at (INDEXED)
```

### 2️⃣1️⃣ **Inventory_Counts (الجرد)**
```sql
inventory_counts
├── id (PK, UUID)
├── count_number (UNIQUE, AUTO-INCREMENT)
├── date (DATE, NOT NULL)
├── type (ENUM: كامل, جزئي)
├── category_id (FK → categories.id, NULLABLE) -- للجرد الجزئي
├── status (ENUM: قيد التنفيذ, مكتمل, معتمد, ملغي)
├── is_approved (BOOLEAN, DEFAULT FALSE)
├── approved_by (FK → users.id)
├── approved_at (TIMESTAMP)
├── notes (TEXT)
├── created_by (FK → users.id)
├── created_at
└── updated_at
```

### 2️⃣2️⃣ **Inventory_Count_Items (عناصر الجرد)**
```sql
inventory_count_items
├── id (PK, UUID)
├── count_id (FK → inventory_counts.id)
├── product_id (FK → products.id)
├── product_name (NOT NULL)
├── system_quantity (INTEGER, NOT NULL) -- الكمية في النظام
├── actual_quantity (INTEGER, NOT NULL) -- الكمية الفعلية
├── difference (INTEGER) -- الفرق
├── notes (TEXT)
└── created_at
```

---

## 🕐 **الورديات**

### 2️⃣3️⃣ **Shifts (الورديات)**
```sql
shifts
├── id (PK, UUID)
├── shift_number (UNIQUE, AUTO-INCREMENT)
├── user_id (FK → users.id, NOT NULL)
├── opened_at (TIMESTAMP, NOT NULL)
├── closed_at (TIMESTAMP)
├── opening_cash (DECIMAL, DEFAULT 0)
├── closing_cash (DECIMAL)
├── expected_cash (DECIMAL) -- المتوقع من المبيعات
├── actual_cash (DECIMAL) -- الفعلي عند الإغلاق
├── cash_difference (DECIMAL) -- الفرق
├── total_sales (DECIMAL, DEFAULT 0)
├── total_cash_sales (DECIMAL, DEFAULT 0)
├── total_credit_sales (DECIMAL, DEFAULT 0)
├── total_returns (DECIMAL, DEFAULT 0)
├── total_expenses (DECIMAL, DEFAULT 0)
├── status (ENUM: مفتوحة, مغلقة)
├── notes (TEXT)
└── closed_by (FK → users.id)
```

### 2️⃣4️⃣ **Shift_Transactions (حركات الوردية)**
```sql
shift_transactions
├── id (PK, UUID)
├── shift_id (FK → shifts.id)
├── type (ENUM: sale, return, expense, opening, closing)
├── amount (DECIMAL, NOT NULL)
├── reference_type (TEXT)
├── reference_id (UUID)
├── notes (TEXT)
└── created_at
```

---

## 💸 **المصروفات**

### 2️⃣5️⃣ **Expenses (المصروفات)**
```sql
expenses
├── id (PK, UUID)
├── expense_number (UNIQUE, AUTO-INCREMENT)
├── date (DATE, NOT NULL, INDEXED)
├── category (NOT NULL) -- إيجار، رواتب، كهرباء، صيانة
├── description (TEXT, NOT NULL)
├── amount (DECIMAL, NOT NULL)
├── paid_by (NOT NULL) -- اسم من دفع
├── payment_method (ENUM: نقداً, تحويل, بطاقة)
├── shift_id (FK → shifts.id)
├── is_cancelled (BOOLEAN, DEFAULT FALSE)
├── created_by (FK → users.id)
└── created_at
```

---

## 🔔 **الإشعارات**

### 2️⃣6️⃣ **Notifications (الإشعارات)**
```sql
notifications
├── id (PK, UUID)
├── user_id (FK → users.id, NULLABLE) -- إذا كانت لمستخدم محدد
├── type (ENUM: LOW_STOCK, EXPIRY_WARNING, DEBT_ALERT, SHIFT_ALERT, SYSTEM)
├── title (NOT NULL)
├── message (TEXT, NOT NULL)
├── priority (ENUM: high, medium, low)
├── is_read (BOOLEAN, DEFAULT FALSE)
├── read_at (TIMESTAMP)
├── reference_type (TEXT)
├── reference_id (UUID)
└── created_at (INDEXED)
```

---

## ⚙️ **إعدادات النظام**

### 2️⃣7️⃣ **System_Settings (إعدادات النظام)**
```sql
system_settings
├── id (PK, UUID)
├── key (UNIQUE, NOT NULL) -- STORE_NAME, CURRENCY, TAX_RATE, etc.
├── value (TEXT, NOT NULL)
├── type (ENUM: string, number, boolean, json)
├── description (TEXT)
├── is_public (BOOLEAN, DEFAULT FALSE)
├── updated_by (FK → users.id)
└── updated_at
```

---

## 💾 **النسخ الاحتياطي**

### 2️⃣8️⃣ **Backup_History (سجل النسخ الاحتياطية)**
```sql
backup_history
├── id (PK, UUID)
├── filename (NOT NULL)
├── file_size (BIGINT) -- بالبايت
├── type (ENUM: auto, manual)
├── location (TEXT) -- المسار المحلي أو السحابي
├── status (ENUM: success, failed, in_progress)
├── error_message (TEXT)
├── started_at (TIMESTAMP, NOT NULL)
├── completed_at (TIMESTAMP)
└── created_by (FK → users.id)
```

---

## 🔄 **المزامنة**

### 2️⃣9️⃣ **Sync_Queue (طابور المزامنة)**
```sql
sync_queue
├── id (PK, UUID)
├── table_name (NOT NULL)
├── record_id (UUID, NOT NULL)
├── operation (ENUM: CREATE, UPDATE, DELETE)
├── data (JSONB, NOT NULL) -- البيانات الكاملة
├── status (ENUM: pending, synced, failed)
├── retry_count (INTEGER, DEFAULT 0)
├── last_error (TEXT)
├── created_at (INDEXED)
├── synced_at (TIMESTAMP)
└── INDEX(status, created_at)
```

---

## 📝 **سجل التدقيق**

### 3️⃣0️⃣ **Audit_Log (سجل العمليات)**
```sql
audit_log
├── id (PK, UUID)
├── user_id (FK → users.id, NOT NULL)
├── action (NOT NULL) -- CREATE, UPDATE, DELETE, APPROVE, LOGIN, LOGOUT
├── module (NOT NULL) -- PRODUCTS, SALES, USERS, etc.
├── entity_type (NOT NULL) -- اسم الجدول
├── entity_id (UUID)
├── old_data (JSONB) -- البيانات القديمة
├── new_data (JSONB) -- البيانات الجديدة
├── ip_address (INET)
├── user_agent (TEXT)
├── timestamp (TIMESTAMP, NOT NULL, INDEXED)
└── INDEX(user_id, timestamp), INDEX(module, action)
```

---

## 🔗 **العلاقات الرئيسية (Foreign Keys)**

```
Users → Roles (Many-to-One)
Roles → Permissions (Many-to-Many via Role_Permissions)
Products → Categories (Many-to-One)
Products → Units (Many-to-One)
Products → Suppliers (Many-to-One)
Product_Barcodes → Products (Many-to-One)

Sales → Customers (Many-to-One)
Sales → Users (created_by)
Sales → Shifts (Many-to-One)
Sale_Items → Sales (Many-to-One)
Sale_Items → Products (Many-to-One)

Purchases → Suppliers (Many-to-One)
Purchases → Users (created_by, approved_by)
Purchase_Items → Purchases (Many-to-One)
Purchase_Items → Products (Many-to-One)

Inventory_Movements → Products (Many-to-One)
Inventory_Movements → Users (created_by)
Inventory_Counts → Users (created_by, approved_by)
Inventory_Count_Items → Inventory_Counts (Many-to-One)
Inventory_Count_Items → Products (Many-to-One)

Shifts → Users (opened_by, closed_by)
Shift_Transactions → Shifts (Many-to-One)

Payments → Customers (Many-to-One, NULLABLE)
Payments → Suppliers (Many-to-One, NULLABLE)

Notifications → Users (Many-to-One, NULLABLE)
Audit_Log → Users (Many-to-One)
```

---

## 📋 **الفهارس المهمة (Important Indexes)**

```sql
-- Performance Indexes
CREATE INDEX idx_products_barcode ON product_barcodes(barcode);
CREATE INDEX idx_products_stock ON products(stock, min_stock);
CREATE INDEX idx_products_expiry ON products(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_sales_date ON sales(date, status);
CREATE INDEX idx_sales_customer ON sales(customer_id, date);
CREATE INDEX idx_inventory_movements_product_date ON inventory_movements(product_id, created_at);
CREATE INDEX idx_audit_log_user_time ON audit_log(user_id, timestamp);
CREATE INDEX idx_sync_queue_status ON sync_queue(status, created_at);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read, created_at);
```

---

## ✅ **Constraints & Business Rules**

```sql
-- منع المخزون السالب (يمكن تفعيله بصلاحية خاصة)
ALTER TABLE products ADD CONSTRAINT check_stock_non_negative 
  CHECK (stock >= 0 OR created_by IN (SELECT id FROM users WHERE role = 'مالك'));

-- التحقق من صحة الأرصدة
ALTER TABLE customers ADD CONSTRAINT check_balance_calculation
  CHECK (balance = total_purchases - total_payments);

ALTER TABLE suppliers ADD CONSTRAINT check_supplier_balance
  CHECK (balance = total_purchases - total_payments);

-- التحقق من صحة المبالغ
ALTER TABLE sales ADD CONSTRAINT check_sale_amounts
  CHECK (net_total = subtotal - discount + tax);

ALTER TABLE sale_items ADD CONSTRAINT check_item_total
  CHECK (total = quantity * unit_price - discount + tax);
```

---

## 🎯 **Auto-Increment Sequences**

```sql
-- Sequences للأرقام التسلسلية
CREATE SEQUENCE invoice_number_seq START WITH 1;
CREATE SEQUENCE purchase_number_seq START WITH 1;
CREATE SEQUENCE customer_code_seq START WITH 1;
CREATE SEQUENCE supplier_code_seq START WITH 1;
CREATE SEQUENCE shift_number_seq START WITH 1;
CREATE SEQUENCE expense_number_seq START WITH 1;
```

---

## 📊 **إجمالي الجداول: 30 جدول**

✅ المستخدمون والصلاحيات: 4 جداول
✅ المنتجات والتصنيفات: 4 جداول
✅ العملاء والموردون: 2 جداول
✅ المبيعات ومرتجعها: 4 جداول
✅ المشتريات ومرتجعها: 4 جداول
✅ الدفعات: 1 جدول
✅ المخزون والجرد: 3 جداول
✅ الورديات: 2 جداول
✅ المصروفات: 1 جدول
✅ الإشعارات: 1 جدول
✅ الإعدادات: 1 جدول
✅ النسخ الاحتياطي: 1 جدول
✅ المزامنة: 1 جدول
✅ التدقيق: 1 جدول

---

## 🚀 **Next Steps:**

1. ✅ إنشاء SQLAlchemy Models لجميع الجداول
2. ✅ إعداد Alembic Migrations
3. ✅ بناء Transaction Management System
4. ✅ بناء APIs الكاملة
5. ✅ ربط Frontend بـ Backend
6. ✅ Offline First Implementation
7. ✅ Testing & Documentation
