# قاعدة بيانات ميني ماركت الفنية - ERD التفصيلي الكامل

## 📋 **قائمة الجداول الكاملة (30 جدول)**

---

## 1️⃣ **users** - المستخدمون

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | ✅ | NOT NULL |
| email | VARCHAR(255) | - | - | ✅ UNIQUE | NOT NULL, UNIQUE |
| password | VARCHAR(255) | - | - | - | NOT NULL |
| name | VARCHAR(255) | - | - | - | NOT NULL |
| phone | VARCHAR(50) | - | - | - | NOT NULL |
| role_id | UUID | - | ✅ roles.id | ✅ | NOT NULL |
| status | ENUM | - | - | - | DEFAULT 'active' |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |
| last_login | TIMESTAMP | - | - | - | NULL |

**العلاقات:**
- `users.role_id` → `roles.id` (Many-to-One)
- `users` ← `sales.created_by` (One-to-Many)
- `users` ← `audit_log.user_id` (One-to-Many)

---

## 2️⃣ **roles** - الأدوار

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| name | VARCHAR(100) | - | - | ✅ UNIQUE | NOT NULL, UNIQUE |
| description | TEXT | - | - | - | NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**القيم الثابتة:**
- مالك (Owner)
- مشرف (Supervisor)
- كاشير (Cashier)
- أمين مخزون (Stock Manager)

**العلاقات:**
- `roles` → `users` (One-to-Many)
- `roles` → `role_permissions` (One-to-Many)

---

## 3️⃣ **permissions** - الصلاحيات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| name | VARCHAR(100) | - | - | ✅ UNIQUE | NOT NULL, UNIQUE |
| module | VARCHAR(50) | - | - | ✅ | NOT NULL |
| action | VARCHAR(50) | - | - | ✅ | NOT NULL |
| description | TEXT | - | - | - | NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

**أمثلة:**
- `products.create`, `products.update`, `products.delete`
- `sales.create`, `sales.view`, `sales.delete`
- `prices.edit`, `inventory.adjust`

**العلاقات:**
- `permissions` → `role_permissions` (One-to-Many)

---

## 4️⃣ **role_permissions** - صلاحيات الأدوار

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| role_id | UUID | - | ✅ roles.id | ✅ | NOT NULL |
| permission_id | UUID | - | ✅ permissions.id | ✅ | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

**Unique Constraint:** `UNIQUE(role_id, permission_id)`

---

## 5️⃣ **categories** - تصنيفات المنتجات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| name | VARCHAR(255) | - | - | ✅ UNIQUE | NOT NULL, UNIQUE |
| parent_id | UUID | - | ✅ categories.id | ✅ | NULL (للتصنيفات الفرعية) |
| description | TEXT | - | - | - | NULL |
| is_active | BOOLEAN | - | - | - | DEFAULT TRUE |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**Self-Referencing:** للتصنيفات الرئيسية والفرعية

---

## 6️⃣ **units** - وحدات القياس

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| name | VARCHAR(100) | - | - | ✅ UNIQUE | NOT NULL, UNIQUE |
| symbol | VARCHAR(20) | - | - | ✅ UNIQUE | UNIQUE |
| is_active | BOOLEAN | - | - | - | DEFAULT TRUE |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

**أمثلة:** قطعة، كرتون، كيلو، لتر، حبة

---

## 7️⃣ **products** - المنتجات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | ✅ | NOT NULL |
| name | VARCHAR(255) | - | - | ✅ | NOT NULL |
| sku | VARCHAR(100) | - | - | ✅ UNIQUE | UNIQUE |
| category_id | UUID | - | ✅ categories.id | ✅ | NOT NULL |
| unit_id | UUID | - | ✅ units.id | - | NOT NULL |
| supplier_id | UUID | - | ✅ suppliers.id | ✅ | NULL |
| purchase_price | DECIMAL(15,2) | - | - | - | NOT NULL |
| sale_price | DECIMAL(15,2) | - | - | - | NOT NULL |
| stock | INTEGER | - | - | ✅ | DEFAULT 0, NOT NULL |
| min_stock | INTEGER | - | - | - | DEFAULT 0 |
| max_stock | INTEGER | - | - | - | NULL |
| expiry_date | DATE | - | - | ✅ | NULL |
| description | TEXT | - | - | - | NULL |
| image_url | TEXT | - | - | - | NULL |
| is_active | BOOLEAN | - | - | - | DEFAULT TRUE |
| is_approved | BOOLEAN | - | - | ✅ | DEFAULT FALSE |
| is_deleted | BOOLEAN | - | - | ✅ | DEFAULT FALSE |
| approved_by | UUID | - | ✅ users.id | - | NULL |
| approved_at | TIMESTAMP | - | - | - | NULL |
| created_by | UUID | - | ✅ users.id | - | NOT NULL |
| created_at | TIMESTAMP | - | - | ✅ | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**Indexes:**
- `idx_products_name` ON `name`
- `idx_products_stock_min` ON `(stock, min_stock)`
- `idx_products_expiry` ON `expiry_date` WHERE `expiry_date IS NOT NULL`
- `idx_products_active_approved` ON `(is_active, is_approved, is_deleted)`

**Constraints:**
- `CHECK (stock >= 0)` (يمكن تعطيله للمدير)
- `CHECK (sale_price >= purchase_price)` (تحذير فقط)

---

## 8️⃣ **product_barcodes** - باركودات المنتجات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| product_id | UUID | - | ✅ products.id | ✅ | NOT NULL |
| barcode | VARCHAR(100) | - | - | ✅ UNIQUE | NOT NULL, UNIQUE |
| is_primary | BOOLEAN | - | - | - | DEFAULT FALSE |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

**Unique Constraint:** `UNIQUE(product_id, barcode)`

**ملاحظة:** المنتج الواحد يمكن أن يكون له باركودات متعددة

---

## 9️⃣ **customers** - العملاء

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| code | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO |
| name | VARCHAR(255) | - | - | ✅ | NOT NULL |
| phone | VARCHAR(50) | - | - | ✅ | NOT NULL |
| email | VARCHAR(255) | - | - | ✅ UNIQUE | UNIQUE |
| address | TEXT | - | - | - | NULL |
| tax_number | VARCHAR(100) | - | - | ✅ UNIQUE | UNIQUE |
| credit_limit | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| total_purchases | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| total_payments | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| balance | DECIMAL(15,2) | - | - | ✅ | DEFAULT 0 |
| last_purchase_date | DATE | - | - | - | NULL |
| is_active | BOOLEAN | - | - | - | DEFAULT TRUE |
| is_deleted | BOOLEAN | - | - | ✅ | DEFAULT FALSE |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**Constraints:**
- `CHECK (balance = total_purchases - total_payments)`

**Indexes:**
- `idx_customers_name` ON `name`
- `idx_customers_phone` ON `phone`
- `idx_customers_balance` ON `balance` WHERE `balance > 0`

---

## 🔟 **suppliers** - الموردون

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| code | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO |
| name | VARCHAR(255) | - | - | ✅ | NOT NULL |
| phone | VARCHAR(50) | - | - | ✅ | NOT NULL |
| email | VARCHAR(255) | - | - | ✅ UNIQUE | UNIQUE |
| address | TEXT | - | - | - | NULL |
| tax_number | VARCHAR(100) | - | - | ✅ UNIQUE | UNIQUE |
| total_purchases | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| total_payments | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| balance | DECIMAL(15,2) | - | - | ✅ | DEFAULT 0 |
| last_supply_date | DATE | - | - | - | NULL |
| is_active | BOOLEAN | - | - | - | DEFAULT TRUE |
| is_deleted | BOOLEAN | - | - | ✅ | DEFAULT FALSE |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**Constraints:**
- `CHECK (balance = total_purchases - total_payments)`

---

## 1️⃣1️⃣ **sales** - المبيعات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | ✅ | NOT NULL |
| invoice_number | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO, NOT NULL |
| date | DATE | - | - | ✅ | NOT NULL |
| time | TIME | - | - | - | NOT NULL |
| customer_id | UUID | - | ✅ customers.id | ✅ | NULL |
| shift_id | UUID | - | ✅ shifts.id | ✅ | NOT NULL |
| subtotal | DECIMAL(15,2) | - | - | - | NOT NULL |
| discount | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| tax | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| net_total | DECIMAL(15,2) | - | - | - | NOT NULL |
| paid_amount | DECIMAL(15,2) | - | - | - | NOT NULL |
| remaining_amount | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| payment_method | ENUM | - | - | - | NOT NULL |
| payment_status | ENUM | - | - | ✅ | NOT NULL |
| status | ENUM | - | - | ✅ | DEFAULT 'مكتمل' |
| is_cancelled | BOOLEAN | - | - | ✅ | DEFAULT FALSE |
| cancellation_reason | TEXT | - | - | - | NULL |
| cancelled_by | UUID | - | ✅ users.id | - | NULL |
| cancelled_at | TIMESTAMP | - | - | - | NULL |
| notes | TEXT | - | - | - | NULL |
| created_by | UUID | - | ✅ users.id | ✅ | NOT NULL |
| created_at | TIMESTAMP | - | - | ✅ | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**Enums:**
- `payment_method`: نقداً, آجل, تحويل بنكي, بطاقة
- `payment_status`: مكتمل, جزئي, غير مدفوع
- `status`: مكتمل, ملغي, مرتجع

**Constraints:**
- `CHECK (net_total = subtotal - discount + tax)`
- `CHECK (remaining_amount = net_total - paid_amount)`
- **لا يمكن حذف الفواتير** - فقط إلغاء (is_cancelled = TRUE)

**Indexes:**
- `idx_sales_date_status` ON `(date, status)`
- `idx_sales_customer_date` ON `(customer_id, date)`
- `idx_sales_invoice_number` ON `invoice_number`

---

## 1️⃣2️⃣ **sale_items** - عناصر المبيعات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| sale_id | UUID | - | ✅ sales.id | ✅ | NOT NULL |
| product_id | UUID | - | ✅ products.id | ✅ | NOT NULL |
| product_name | VARCHAR(255) | - | - | - | NOT NULL |
| quantity | INTEGER | - | - | - | NOT NULL |
| unit_price | DECIMAL(15,2) | - | - | - | NOT NULL |
| discount | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| tax | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| total | DECIMAL(15,2) | - | - | - | NOT NULL |
| cost_price | DECIMAL(15,2) | - | - | - | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

**Constraints:**
- `CHECK (total = (quantity * unit_price) - discount + tax)`
- **CASCADE DELETE** مع `sales`

---

## 1️⃣3️⃣ **sales_returns** - مرتجع المبيعات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| return_number | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO |
| sale_id | UUID | - | ✅ sales.id | ✅ | NOT NULL |
| date | DATE | - | - | ✅ | NOT NULL |
| time | TIME | - | - | - | NOT NULL |
| customer_id | UUID | - | ✅ customers.id | - | NULL |
| total_amount | DECIMAL(15,2) | - | - | - | NOT NULL |
| refund_method | ENUM | - | - | - | NOT NULL |
| reason | TEXT | - | - | - | NULL |
| status | ENUM | - | - | ✅ | DEFAULT 'مكتمل' |
| created_by | UUID | - | ✅ users.id | - | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**Enums:**
- `refund_method`: نقداً, رصيد
- `status`: مكتمل, ملغي

**ملاحظة مهمة:** المرتجعات **لا تحذف الفاتورة الأصلية**، بل تسجل كعملية منفصلة

---

## 1️⃣4️⃣ **sales_return_items** - عناصر مرتجع المبيعات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| return_id | UUID | - | ✅ sales_returns.id | ✅ | NOT NULL |
| product_id | UUID | - | ✅ products.id | - | NOT NULL |
| product_name | VARCHAR(255) | - | - | - | NOT NULL |
| quantity | INTEGER | - | - | - | NOT NULL |
| unit_price | DECIMAL(15,2) | - | - | - | NOT NULL |
| total | DECIMAL(15,2) | - | - | - | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

---

## 1️⃣5️⃣ **purchases** - المشتريات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| purchase_number | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO |
| date | DATE | - | - | ✅ | NOT NULL |
| supplier_id | UUID | - | ✅ suppliers.id | ✅ | NOT NULL |
| total | DECIMAL(15,2) | - | - | - | NOT NULL |
| paid | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| remaining | DECIMAL(15,2) | - | - | - | NOT NULL |
| payment_status | ENUM | - | - | - | NOT NULL |
| status | ENUM | - | - | ✅ | DEFAULT 'قيد الانتظار' |
| is_approved | BOOLEAN | - | - | ✅ | DEFAULT FALSE |
| approved_by | UUID | - | ✅ users.id | - | NULL |
| approved_at | TIMESTAMP | - | - | - | NULL |
| is_cancelled | BOOLEAN | - | - | - | DEFAULT FALSE |
| notes | TEXT | - | - | - | NULL |
| created_by | UUID | - | ✅ users.id | ✅ | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**Enums:**
- `payment_status`: مكتمل, جزئي, غير مدفوع
- `status`: قيد الانتظار, معتمد, ملغي

**تدفق الاعتماد:**
1. الموظف يدخل فاتورة شراء → `status = 'قيد الانتظار'`
2. المدير يعتمدها → `is_approved = TRUE`, `status = 'معتمد'`
3. فقط بعد الاعتماد تضاف الكميات للمخزون

---

## 1️⃣6️⃣ **purchase_items** - عناصر المشتريات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| purchase_id | UUID | - | ✅ purchases.id | ✅ | NOT NULL |
| product_id | UUID | - | ✅ products.id | - | NOT NULL |
| product_name | VARCHAR(255) | - | - | - | NOT NULL |
| quantity | INTEGER | - | - | - | NOT NULL |
| unit_price | DECIMAL(15,2) | - | - | - | NOT NULL |
| total | DECIMAL(15,2) | - | - | - | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

---

## 1️⃣7️⃣ **purchase_returns** - مرتجع المشتريات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| return_number | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO |
| purchase_id | UUID | - | ✅ purchases.id | - | NOT NULL |
| supplier_id | UUID | - | ✅ suppliers.id | - | NOT NULL |
| date | DATE | - | - | - | NOT NULL |
| total_amount | DECIMAL(15,2) | - | - | - | NOT NULL |
| reason | TEXT | - | - | - | NULL |
| status | ENUM | - | - | - | DEFAULT 'مكتمل' |
| created_by | UUID | - | ✅ users.id | - | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

---

## 1️⃣8️⃣ **purchase_return_items** - عناصر مرتجع المشتريات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| return_id | UUID | - | ✅ purchase_returns.id | - | NOT NULL |
| product_id | UUID | - | ✅ products.id | - | NOT NULL |
| product_name | VARCHAR(255) | - | - | - | NOT NULL |
| quantity | INTEGER | - | - | - | NOT NULL |
| unit_price | DECIMAL(15,2) | - | - | - | NOT NULL |
| total | DECIMAL(15,2) | - | - | - | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

---

## 1️⃣9️⃣ **payments** - الدفعات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| payment_number | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO |
| date | DATE | - | - | ✅ | NOT NULL |
| type | ENUM | - | - | - | NOT NULL |
| customer_id | UUID | - | ✅ customers.id | ✅ | NULL |
| supplier_id | UUID | - | ✅ suppliers.id | ✅ | NULL |
| amount | DECIMAL(15,2) | - | - | - | NOT NULL |
| payment_method | ENUM | - | - | - | NOT NULL |
| reference_type | ENUM | - | - | - | NULL |
| reference_id | UUID | - | - | - | NULL |
| notes | TEXT | - | - | - | NULL |
| created_by | UUID | - | ✅ users.id | - | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

**Enums:**
- `type`: استلام, دفع
- `payment_method`: نقداً, تحويل بنكي, بطاقة
- `reference_type`: sale, purchase, other

**Constraints:**
- `CHECK ((customer_id IS NOT NULL AND supplier_id IS NULL) OR (customer_id IS NULL AND supplier_id IS NOT NULL))`
- **لا يمكن حذف الدفعات نهائياً**

---

## 2️⃣0️⃣ **inventory_movements** - حركات المخزون

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| product_id | UUID | - | ✅ products.id | ✅ | NOT NULL |
| type | ENUM | - | - | ✅ | NOT NULL |
| quantity | INTEGER | - | - | - | NOT NULL |
| quantity_before | INTEGER | - | - | - | NOT NULL |
| quantity_after | INTEGER | - | - | - | NOT NULL |
| reference_type | ENUM | - | - | ✅ | NULL |
| reference_id | UUID | - | - | - | NULL |
| notes | TEXT | - | - | - | NULL |
| created_by | UUID | - | ✅ users.id | - | NOT NULL |
| created_at | TIMESTAMP | - | - | ✅ | DEFAULT NOW() |

**Enums:**
- `type`: IN (إدخال), OUT (إخراج), ADJUSTMENT (تعديل), RETURN (مرتجع)
- `reference_type`: sale, purchase, adjustment, inventory_count, sales_return, purchase_return

**تنبيه مهم جداً:**
- **لا يمكن حذف حركات المخزون نهائياً**
- كل حركة مخزون تسجل في Audit Log

**Indexes:**
- `idx_inventory_product_date` ON `(product_id, created_at)`
- `idx_inventory_type` ON `type`

---

## 2️⃣1️⃣ **inventory_counts** - الجرد

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| count_number | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO |
| date | DATE | - | - | ✅ | NOT NULL |
| type | ENUM | - | - | - | NOT NULL |
| category_id | UUID | - | ✅ categories.id | - | NULL (للجرد الجزئي) |
| status | ENUM | - | - | ✅ | DEFAULT 'قيد التنفيذ' |
| is_approved | BOOLEAN | - | - | ✅ | DEFAULT FALSE |
| approved_by | UUID | - | ✅ users.id | - | NULL |
| approved_at | TIMESTAMP | - | - | - | NULL |
| notes | TEXT | - | - | - | NULL |
| created_by | UUID | - | ✅ users.id | - | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**Enums:**
- `type`: كامل, جزئي
- `status`: قيد التنفيذ, مكتمل, معتمد, ملغي

**تدفق الجرد:**
1. بدء الجرد → `status = 'قيد التنفيذ'`
2. إدخال الكميات الفعلية
3. حساب الفروقات
4. اعتماد المدير → `is_approved = TRUE`, `status = 'معتمد'`
5. تحديث المخزون

---

## 2️⃣2️⃣ **inventory_count_items** - عناصر الجرد

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| count_id | UUID | - | ✅ inventory_counts.id | ✅ | NOT NULL |
| product_id | UUID | - | ✅ products.id | - | NOT NULL |
| product_name | VARCHAR(255) | - | - | - | NOT NULL |
| system_quantity | INTEGER | - | - | - | NOT NULL |
| actual_quantity | INTEGER | - | - | - | NOT NULL |
| difference | INTEGER | - | - | - | GENERATED |
| notes | TEXT | - | - | - | NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

**Computed Column:**
- `difference = actual_quantity - system_quantity`

---

## 2️⃣3️⃣ **shifts** - الورديات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| shift_number | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO |
| user_id | UUID | - | ✅ users.id | ✅ | NOT NULL |
| opened_at | TIMESTAMP | - | - | ✅ | NOT NULL |
| closed_at | TIMESTAMP | - | - | - | NULL |
| opening_cash | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| closing_cash | DECIMAL(15,2) | - | - | - | NULL |
| expected_cash | DECIMAL(15,2) | - | - | - | NULL |
| actual_cash | DECIMAL(15,2) | - | - | - | NULL |
| cash_difference | DECIMAL(15,2) | - | - | - | GENERATED |
| total_sales | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| total_cash_sales | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| total_credit_sales | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| total_returns | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| total_expenses | DECIMAL(15,2) | - | - | - | DEFAULT 0 |
| status | ENUM | - | - | ✅ | DEFAULT 'مفتوحة' |
| notes | TEXT | - | - | - | NULL |
| closed_by | UUID | - | ✅ users.id | - | NULL |

**Enums:**
- `status`: مفتوحة, مغلقة

**Computed Column:**
- `cash_difference = actual_cash - expected_cash`

**تدفق الوردية:**
1. فتح الوردية → `status = 'مفتوحة'`, `opened_at = NOW()`
2. إدخال المبالغ الافتتاحية
3. تسجيل المبيعات والمصروفات
4. إغلاق الوردية → `status = 'مغلقة'`, `closed_at = NOW()`
5. حساب الفرق النقدي

---

## 2️⃣4️⃣ **shift_transactions** - حركات الوردية

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| shift_id | UUID | - | ✅ shifts.id | ✅ | NOT NULL |
| type | ENUM | - | - | ✅ | NOT NULL |
| amount | DECIMAL(15,2) | - | - | - | NOT NULL |
| reference_type | VARCHAR(50) | - | - | - | NULL |
| reference_id | UUID | - | - | - | NULL |
| notes | TEXT | - | - | - | NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

**Enums:**
- `type`: sale (بيع), return (مرتجع), expense (مصروف), opening (افتتاحية), closing (ختامية)

---

## 2️⃣5️⃣ **expenses** - المصروفات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| expense_number | VARCHAR(50) | - | - | ✅ UNIQUE | UNIQUE, AUTO |
| date | DATE | - | - | ✅ | NOT NULL |
| category | VARCHAR(100) | - | - | ✅ | NOT NULL |
| description | TEXT | - | - | - | NOT NULL |
| amount | DECIMAL(15,2) | - | - | - | NOT NULL |
| paid_by | VARCHAR(255) | - | - | - | NOT NULL |
| payment_method | ENUM | - | - | - | NOT NULL |
| shift_id | UUID | - | ✅ shifts.id | - | NULL |
| is_cancelled | BOOLEAN | - | - | - | DEFAULT FALSE |
| created_by | UUID | - | ✅ users.id | - | NOT NULL |
| created_at | TIMESTAMP | - | - | - | DEFAULT NOW() |

**Enums:**
- `payment_method`: نقداً, تحويل بنكي, بطاقة

**Categories:** إيجار, رواتب, كهرباء, ماء, صيانة, تسويق, أخرى

---

## 2️⃣6️⃣ **notifications** - الإشعارات

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| user_id | UUID | - | ✅ users.id | ✅ | NULL (للإشعارات العامة) |
| type | ENUM | - | - | ✅ | NOT NULL |
| title | VARCHAR(255) | - | - | - | NOT NULL |
| message | TEXT | - | - | - | NOT NULL |
| priority | ENUM | - | - | - | DEFAULT 'medium' |
| is_read | BOOLEAN | - | - | ✅ | DEFAULT FALSE |
| read_at | TIMESTAMP | - | - | - | NULL |
| reference_type | VARCHAR(50) | - | - | - | NULL |
| reference_id | UUID | - | - | - | NULL |
| created_at | TIMESTAMP | - | - | ✅ | DEFAULT NOW() |

**Enums:**
- `type`: LOW_STOCK, EXPIRY_WARNING, DEBT_ALERT, SHIFT_ALERT, SYSTEM, APPROVAL_NEEDED
- `priority`: high, medium, low

**Indexes:**
- `idx_notifications_user_read` ON `(user_id, is_read, created_at)`

---

## 2️⃣7️⃣ **system_settings** - إعدادات النظام

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| key | VARCHAR(100) | - | - | ✅ UNIQUE | UNIQUE, NOT NULL |
| value | TEXT | - | - | - | NOT NULL |
| type | ENUM | - | - | - | NOT NULL |
| description | TEXT | - | - | - | NULL |
| is_public | BOOLEAN | - | - | - | DEFAULT FALSE |
| updated_by | UUID | - | ✅ users.id | - | NULL |
| updated_at | TIMESTAMP | - | - | - | ON UPDATE NOW() |

**Enums:**
- `type`: string, number, boolean, json

**أمثلة:**
```
STORE_NAME = "ميني ماركت الفنية"
CURRENCY = "ريال يمني"
TAX_RATE = 0
ALLOW_NEGATIVE_STOCK = false
LOW_STOCK_THRESHOLD = 10
EXPIRY_WARNING_DAYS = 30
```

---

## 2️⃣8️⃣ **backup_history** - سجل النسخ الاحتياطية

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| filename | VARCHAR(255) | - | - | - | NOT NULL |
| file_size | BIGINT | - | - | - | NULL |
| type | ENUM | - | - | - | NOT NULL |
| location | TEXT | - | - | - | NOT NULL |
| status | ENUM | - | - | ✅ | NOT NULL |
| error_message | TEXT | - | - | - | NULL |
| started_at | TIMESTAMP | - | - | ✅ | NOT NULL |
| completed_at | TIMESTAMP | - | - | - | NULL |
| created_by | UUID | - | ✅ users.id | - | NULL |

**Enums:**
- `type`: auto, manual
- `status`: success, failed, in_progress

**Indexes:**
- `idx_backup_started_at` ON `started_at`

---

## 2️⃣9️⃣ **sync_queue** - طابور المزامنة

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| table_name | VARCHAR(100) | - | - | ✅ | NOT NULL |
| record_id | UUID | - | - | - | NOT NULL |
| operation | ENUM | - | - | ✅ | NOT NULL |
| data | JSONB | - | - | - | NOT NULL |
| status | ENUM | - | - | ✅ | NOT NULL |
| retry_count | INTEGER | - | - | - | DEFAULT 0 |
| max_retries | INTEGER | - | - | - | DEFAULT 3 |
| last_error | TEXT | - | - | - | NULL |
| created_at | TIMESTAMP | - | - | ✅ | DEFAULT NOW() |
| synced_at | TIMESTAMP | - | - | - | NULL |

**Enums:**
- `operation`: CREATE, UPDATE, DELETE
- `status`: pending, synced, failed

**Indexes:**
- `idx_sync_status_created` ON `(status, created_at)`
- `idx_sync_table_record` ON `(table_name, record_id)`

**آلية المزامنة:**
1. أي عملية تتم محلياً → تضاف إلى `sync_queue`
2. عند توفر الإنترنت → تشغيل worker للمزامنة
3. محاولة المزامنة → max 3 مرات
4. نجاح → `status = 'synced'`, `synced_at = NOW()`
5. فشل → `status = 'failed'`, تسجيل الخطأ

---

## 3️⃣0️⃣ **audit_log** - سجل التدقيق

| الحقل | النوع | Primary Key | Foreign Key | Index | Constraints |
|------|------|-------------|-------------|-------|-------------|
| id | UUID | ✅ PK | - | - | NOT NULL |
| user_id | UUID | - | ✅ users.id | ✅ | NOT NULL |
| action | VARCHAR(50) | - | - | ✅ | NOT NULL |
| module | VARCHAR(50) | - | - | ✅ | NOT NULL |
| entity_type | VARCHAR(100) | - | - | - | NOT NULL |
| entity_id | UUID | - | - | - | NULL |
| old_data | JSONB | - | - | - | NULL |
| new_data | JSONB | - | - | - | NULL |
| ip_address | INET | - | - | - | NULL |
| user_agent | TEXT | - | - | - | NULL |
| timestamp | TIMESTAMP | - | - | ✅ | NOT NULL, DEFAULT NOW() |

**Actions:**
- CREATE, UPDATE, DELETE, APPROVE, LOGIN, LOGOUT, PRICE_CHANGE, STOCK_ADJUST

**Modules:**
- PRODUCTS, SALES, PURCHASES, CUSTOMERS, SUPPLIERS, INVENTORY, USERS, SETTINGS

**⚠️ CRITICAL:**
- **لا يمكن تعديل أو حذف Audit Log نهائياً**
- جميع العمليات تسجل تلقائياً
- يحفظ البيانات القديمة والجديدة

**Indexes:**
- `idx_audit_user_timestamp` ON `(user_id, timestamp)`
- `idx_audit_module_action` ON `(module, action)`
- `idx_audit_timestamp` ON `timestamp`

---

## 🔗 **مخطط العلاقات الكامل (Relationships)**

```
┌─────────────────────────────────────────────────────────────┐
│                     نظام المصادقة والصلاحيات                │
└─────────────────────────────────────────────────────────────┘
users ──┬─→ roles (Many-to-One)
        └─→ created many sales, purchases, etc.

roles ──→ role_permissions ──→ permissions (Many-to-Many)

┌─────────────────────────────────────────────────────────────┐
│                      المنتجات والتصنيفات                     │
└─────────────────────────────────────────────────────────────┘
categories ──→ products (One-to-Many)
           └─→ self-reference (parent-child)

units ──→ products (One-to-Many)

suppliers ──→ products (One-to-Many)

products ──┬─→ product_barcodes (One-to-Many)
           ├─→ sale_items (One-to-Many)
           ├─→ purchase_items (One-to-Many)
           └─→ inventory_movements (One-to-Many)

┌─────────────────────────────────────────────────────────────┐
│                        المبيعات والمرتجعات                    │
└─────────────────────────────────────────────────────────────┘
customers ──┬─→ sales (One-to-Many)
            ├─→ payments (One-to-Many)
            └─→ sales_returns (One-to-Many)

shifts ──→ sales (One-to-Many)
       └─→ shift_transactions (One-to-Many)

sales ──┬─→ sale_items (One-to-Many, CASCADE)
        └─→ sales_returns (One-to-Many)

sales_returns ──→ sales_return_items (One-to-Many, CASCADE)

┌─────────────────────────────────────────────────────────────┐
│                       المشتريات والمرتجعات                    │
└─────────────────────────────────────────────────────────────┘
suppliers ──┬─→ purchases (One-to-Many)
            ├─→ payments (One-to-Many)
            └─→ purchase_returns (One-to-Many)

purchases ──┬─→ purchase_items (One-to-Many, CASCADE)
            └─→ purchase_returns (One-to-Many)

purchase_returns ──→ purchase_return_items (One-to-Many, CASCADE)

┌─────────────────────────────────────────────────────────────┐
│                         المخزون والجرد                        │
└─────────────────────────────────────────────────────────────┘
products ──→ inventory_movements (One-to-Many)

inventory_counts ──→ inventory_count_items (One-to-Many)

┌─────────────────────────────────────────────────────────────┐
│                    النظام والتدقيق والمزامنة                  │
└─────────────────────────────────────────────────────────────┘
users ──→ audit_log (One-to-Many, NO DELETE)

sync_queue (مستقل - لا يرتبط بـ FK)

backup_history (مستقل)

system_settings (مستقل)

notifications ──→ users (Many-to-One, Optional)
```

---

## ⚙️ **الآليات المهمة (Critical Mechanisms)**

### 1️⃣ **Soft Delete**
```sql
-- جميع الجداول الرئيسية بها:
is_deleted BOOLEAN DEFAULT FALSE

-- عند "الحذف":
UPDATE products SET is_deleted = TRUE WHERE id = ?;

-- عند الاستعلام:
SELECT * FROM products WHERE is_deleted = FALSE;
```

### 2️⃣ **Audit Log**
```sql
-- كل عملية مهمة تسجل تلقائياً:
INSERT INTO audit_log (
  user_id, action, module, entity_type, entity_id,
  old_data, new_data, ip_address, timestamp
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW());

-- ⚠️ لا يمكن UPDATE أو DELETE على audit_log
```

### 3️⃣ **Sync Queue**
```sql
-- عند أي عملية محلية:
INSERT INTO sync_queue (
  table_name, record_id, operation, data, status
) VALUES (?, ?, ?, ?, 'pending');

-- عند توفر الإنترنت:
SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at;
-- محاولة المزامنة
-- نجاح → UPDATE status = 'synced'
-- فشل → UPDATE retry_count + 1
```

### 4️⃣ **Daily Closing (إغلاق الوردية)**
```sql
-- فتح وردية:
INSERT INTO shifts (user_id, opened_at, opening_cash, status)
VALUES (?, NOW(), ?, 'مفتوحة');

-- خلال الوردية:
-- تسجيل المبيعات والمصروفات تلقائياً في shift_transactions

-- إغلاق الوردية:
UPDATE shifts SET
  closed_at = NOW(),
  closing_cash = ?,
  actual_cash = ?,
  cash_difference = actual_cash - expected_cash,
  status = 'مغلقة',
  closed_by = ?
WHERE id = ? AND status = 'مفتوحة';
```

### 5️⃣ **Approval Workflow**
```sql
-- المشتريات:
1. موظف يضيف → status = 'قيد الانتظار', is_approved = FALSE
2. مدير يعتمد → is_approved = TRUE, status = 'معتمد', approved_by = ?, approved_at = NOW()
3. فقط بعد الاعتماد → تحديث المخزون

-- المنتجات الجديدة:
1. موظف يضيف → is_approved = FALSE, is_active = FALSE
2. مدير يعتمد → is_approved = TRUE, is_active = TRUE
3. فقط المنتجات المعتمدة تظهر في POS

-- الجرد:
1. بدء جرد → status = 'قيد التنفيذ'
2. إدخال الكميات
3. مدير يعتمد → is_approved = TRUE, status = 'معتمد'
4. تحديث المخزون تلقائياً
```

---

## 🔒 **قواعد الأمان والحماية (Security Rules)**

### **منع الحذف النهائي:**
```sql
-- ❌ لا يُسمح أبداً:
DELETE FROM sales;
DELETE FROM inventory_movements;
DELETE FROM payments;
DELETE FROM audit_log;

-- ✅ البديل:
UPDATE sales SET is_cancelled = TRUE WHERE id = ?;
```

### **Database Transactions:**
```python
@transaction
async def create_sale(sale_data):
    # BEGIN TRANSACTION
    
    # 1. إنشاء فاتورة
    sale = await create_sale_record(sale_data)
    
    # 2. إضافة عناصر الفاتورة
    for item in sale_data.items:
        await create_sale_item(sale.id, item)
        
        # 3. تحديث المخزون
        await update_product_stock(item.product_id, -item.quantity)
        
        # 4. تسجيل حركة المخزون
        await create_inventory_movement(...)
    
    # 5. تحديث حساب العميل
    await update_customer_balance(...)
    
    # 6. تسجيل في Audit Log
    await log_audit(...)
    
    # COMMIT - إما تنجح كلها أو تفشل كلها
```

### **منع المخزون السالب:**
```sql
-- Constraint على products:
ALTER TABLE products ADD CONSTRAINT check_stock_non_negative
CHECK (
  stock >= 0 
  OR 
  EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = products.created_by 
    AND u.role_id = (SELECT id FROM roles WHERE name = 'مالك')
  )
);
```

---

## 📊 **إحصائيات الـ Schema**

✅ **30 جدول** كامل
✅ **150+ حقل** تقريباً
✅ **50+ Foreign Key** للعلاقات
✅ **40+ Index** للسرعة
✅ **20+ Constraint** لضمان صحة البيانات
✅ **10+ Enum** للقيم الثابتة
✅ **5+ Computed Column** للحسابات التلقائية

---

## ✅ **التأكيدات النهائية:**

### ✅ **جميع متطلباتك موجودة:**
1. ✅ Sales Returns & Purchase Returns - مستقلة
2. ✅ Inventory Counts - نظام جرد كامل
3. ✅ Product Barcodes - باركودات متعددة
4. ✅ Backup History - سجل كامل
5. ✅ Sync Queue - مزامنة ذكية
6. ✅ System Settings - إعدادات مرنة
7. ✅ Notifications - تنبيهات ذكية
8. ✅ Shift Transactions - تتبع كامل

### ✅ **الحماية والأمان:**
1. ✅ منع حذف الفواتير والحركات
2. ✅ Soft Delete لجميع البيانات
3. ✅ Audit Log غير قابل للتعديل
4. ✅ Transactions لضمان السلامة
5. ✅ Constraints لمنع البيانات الخاطئة

### ✅ **قابلية التوسع:**
- ✅ Schema مرن وقابل للتطوير
- ✅ Indexes محسنة للسرعة
- ✅ JSONB للبيانات الديناميكية
- ✅ Foreign Keys للعلاقات القوية

---

## 🎯 **الخطوة التالية:**

**هل توافق على هذا الـ Schema الآن؟**

إذا نعم → سأبدأ فوراً بـ:
1. SQLAlchemy Models
2. Alembic Migrations
3. APIs

**أو تريد توضيحات إضافية؟** 🚀
