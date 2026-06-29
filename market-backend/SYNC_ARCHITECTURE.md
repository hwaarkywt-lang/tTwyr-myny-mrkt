# نظام المزامنة - Offline First Architecture
## مخطط المزامنة الكامل

---

## 🏗️ **البنية المعمارية (Architecture)**

```
┌───────────────────────────────────────────────────────────┐
│                  ميني ماركت الفنية                        │
│                  (داخل المتجر)                            │
└───────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    🖥️ Local Server                      │
│                                                         │
│   ┌─────────────────────────────────────────────┐     │
│   │     FastAPI Backend                         │     │
│   │     Port: 8001                              │     │
│   └─────────────────────────────────────────────┘     │
│                                                         │
│   ┌─────────────────────────────────────────────┐     │
│   │     PostgreSQL Database (المحلية)           │     │
│   │     🎯 المصدر الرئيسي للبيانات              │     │
│   └─────────────────────────────────────────────┘     │
│                                                         │
│   ┌─────────────────────────────────────────────┐     │
│   │     Sync Queue Service                      │     │
│   │     (خدمة المزامنة)                         │     │
│   └─────────────────────────────────────────────┘     │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          ↕️
                    (الإنترنت)
                          ↕️
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    ☁️ Cloud Server                       │
│                    (للنسخ الاحتياطي)                    │
│                                                         │
│   ┌─────────────────────────────────────────────┐     │
│   │     Cloud PostgreSQL                        │     │
│   │     (نسخة احتياطية + مزامنة)               │     │
│   └─────────────────────────────────────────────┘     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 **المبادئ الأساسية (Core Principles)**

### **1️⃣ Local First**
```
✅ جميع العمليات تتم محلياً أولاً
✅ لا حاجة للإنترنت للعمل اليومي
✅ PostgreSQL محلية = المصدر الرئيسي
✅ سرعة فائقة (بدون latency)
```

### **2️⃣ Always Available**
```
✅ البيع يعمل بدون إنترنت
✅ المخزون يعمل بدون إنترنت
✅ الجرد يعمل بدون إنترنت
✅ صفر توقف (Zero Downtime)
```

### **3️⃣ Smart Sync**
```
✅ مزامنة تلقائية عند توفر الإنترنت
✅ Queue للعمليات غير المتزامنة
✅ Retry logic للعمليات الفاشلة
✅ Conflict Resolution
```

---

## 🔄 **آلية العمل التفصيلية**

### **السيناريو 1️⃣: العمل مع إنترنت**

```
1. الكاشير ينشئ فاتورة بيع
   ↓
2. تحفظ في PostgreSQL المحلية
   ↓
3. تضاف إلى Sync Queue
   ↓
4. Sync Service يكتشف الإنترنت متوفر
   ↓
5. يرسل البيانات للسحابة
   ↓
6. نجاح → يحدث status = 'synced'
   ↓
7. يحذف من Queue
```

### **السيناريو 2️⃣: العمل بدون إنترنت (Offline)**

```
1. الكاشير ينشئ فاتورة بيع
   ↓
2. تحفظ في PostgreSQL المحلية ✅
   ↓
3. تضاف إلى Sync Queue (status = 'pending')
   ↓
4. Sync Service يحاول الإرسال
   ↓
5. فشل → الإنترنت غير متوفر
   ↓
6. تبقى في Queue
   ↓
7. البيع مكتمل محلياً ✅
   (العمل مستمر بشكل طبيعي)
```

### **السيناريو 3️⃣: عودة الإنترنت**

```
1. Sync Service يكتشف عودة الإنترنت
   ↓
2. يجلب جميع العمليات من Queue
   (status = 'pending' ORDER BY created_at)
   ↓
3. يرسلها واحدة تلو الأخرى
   ↓
4. لكل عملية:
   - نجاح → status = 'synced', synced_at = NOW()
   - فشل → retry_count + 1
   ↓
5. إذا retry_count > max_retries (3)
   → status = 'failed'
   → تنبيه للمدير
```

---

## 📊 **Sync Queue - جدول المزامنة**

```sql
sync_queue
├── id (PK)
├── table_name         -- اسم الجدول (sales, products, etc.)
├── record_id          -- ID السجل
├── operation          -- CREATE, UPDATE, DELETE
├── data               -- البيانات الكاملة (JSONB)
├── status             -- pending, synced, failed
├── retry_count        -- عدد المحاولات (DEFAULT 0)
├── max_retries        -- الحد الأقصى (DEFAULT 3)
├── last_error         -- آخر خطأ
├── created_at         -- وقت الإضافة
└── synced_at          -- وقت المزامنة
```

### **مثال على سجل في Queue:**

```json
{
  "id": "uuid-123",
  "table_name": "sales",
  "record_id": "sale-456",
  "operation": "CREATE",
  "data": {
    "invoice_number": "INV-001",
    "customer_id": "customer-789",
    "items": [...],
    "total": 150000,
    "created_at": "2026-06-17T10:30:00"
  },
  "status": "pending",
  "retry_count": 0,
  "max_retries": 3,
  "last_error": null,
  "created_at": "2026-06-17T10:30:01",
  "synced_at": null
}
```

---

## ⚙️ **Sync Service - خدمة المزامنة**

### **التشغيل التلقائي:**

```python
# Sync Service (Background Worker)

import asyncio
import httpx

class SyncService:
    def __init__(self):
        self.is_online = False
        self.sync_interval = 30  # كل 30 ثانية
        self.cloud_url = "https://cloud-api.minimarket.com"
    
    async def check_internet(self):
        """فحص الإنترنت"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.cloud_url + "/health",
                    timeout=5
                )
                self.is_online = response.status_code == 200
        except:
            self.is_online = False
        
        return self.is_online
    
    async def sync_pending_records(self):
        """مزامنة السجلات المعلقة"""
        if not self.is_online:
            return
        
        # جلب السجلات المعلقة
        pending_records = await db.sync_queue.find({
            "status": "pending",
            "retry_count": {"$lt": "max_retries"}
        }).sort("created_at", 1).limit(100)
        
        for record in pending_records:
            try:
                # إرسال للسحابة
                await self.send_to_cloud(record)
                
                # تحديث الحالة
                await db.sync_queue.update_one(
                    {"id": record["id"]},
                    {
                        "$set": {
                            "status": "synced",
                            "synced_at": datetime.now()
                        }
                    }
                )
                
            except Exception as e:
                # فشلت المحاولة
                await db.sync_queue.update_one(
                    {"id": record["id"]},
                    {
                        "$inc": {"retry_count": 1},
                        "$set": {"last_error": str(e)}
                    }
                )
                
                # إذا وصلت للحد الأقصى
                if record["retry_count"] >= record["max_retries"]:
                    await db.sync_queue.update_one(
                        {"id": record["id"]},
                        {"$set": {"status": "failed"}}
                    )
                    
                    # إرسال تنبيه للمدير
                    await self.notify_admin(record)
    
    async def send_to_cloud(self, record):
        """إرسال السجل للسحابة"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.cloud_url}/sync",
                json=record,
                headers={"Authorization": f"Bearer {API_KEY}"},
                timeout=30
            )
            response.raise_for_status()
    
    async def run(self):
        """تشغيل الخدمة"""
        while True:
            try:
                # فحص الإنترنت
                await self.check_internet()
                
                # إذا متصل → مزامنة
                if self.is_online:
                    await self.sync_pending_records()
                
            except Exception as e:
                logger.error(f"Sync error: {e}")
            
            # انتظار قبل المحاولة التالية
            await asyncio.sleep(self.sync_interval)

# تشغيل الخدمة
sync_service = SyncService()
asyncio.create_task(sync_service.run())
```

---

## 🔧 **التطبيق في الكود**

### **عند إنشاء فاتورة بيع:**

```python
from sqlalchemy import Transaction

@app.post("/api/sales")
async def create_sale(sale_data, current_user):
    async with db.begin() as transaction:  # BEGIN TRANSACTION
        try:
            # 1. إنشاء الفاتورة محلياً
            sale = Sale(
                invoice_number=generate_invoice_number(),
                date=datetime.now().date(),
                customer_id=sale_data.customer_id,
                items=sale_data.items,
                total=calculate_total(sale_data.items),
                created_by=current_user.id
            )
            
            db.add(sale)
            await db.flush()  # للحصول على sale.id
            
            # 2. إضافة العناصر
            for item in sale_data.items:
                sale_item = SaleItem(
                    sale_id=sale.id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    price=item.price,
                    total=item.quantity * item.price
                )
                db.add(sale_item)
                
                # 3. تحديث المخزون
                product = await db.get(Product, item.product_id)
                product.stock -= item.quantity
                
                # 4. تسجيل حركة المخزون
                movement = InventoryMovement(
                    product_id=item.product_id,
                    type="OUT",
                    quantity=item.quantity,
                    quantity_before=product.stock + item.quantity,
                    quantity_after=product.stock,
                    reference_type="sale",
                    reference_id=sale.id,
                    created_by=current_user.id
                )
                db.add(movement)
            
            # 5. تسجيل في Audit Log
            audit = AuditLog(
                user_id=current_user.id,
                action="CREATE",
                module="SALES",
                entity_type="sale",
                entity_id=sale.id,
                new_data=sale.to_dict()
            )
            db.add(audit)
            
            # 6. إضافة إلى Sync Queue
            sync_record = SyncQueue(
                table_name="sales",
                record_id=sale.id,
                operation="CREATE",
                data=sale.to_dict(),
                status="pending"
            )
            db.add(sync_record)
            
            # COMMIT - كل شيء ينجح أو يفشل معاً
            await transaction.commit()
            
            return {"success": True, "sale": sale}
            
        except Exception as e:
            # ROLLBACK تلقائياً
            await transaction.rollback()
            raise HTTPException(500, f"فشل إنشاء الفاتورة: {str(e)}")
```

---

## 📱 **واجهة حالة المزامنة**

### **صفحة مراقبة النظام:**

```javascript
// مثال على Component في React

function SyncStatusPage() {
  const [syncStats, setSyncStats] = useState(null);
  
  useEffect(() => {
    // جلب حالة المزامنة كل 10 ثواني
    const interval = setInterval(async () => {
      const response = await fetch('/api/sync/status');
      const data = await response.json();
      setSyncStats(data);
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="p-6" dir="rtl">
      <h1>حالة المزامنة</h1>
      
      {/* حالة الاتصال */}
      <Card>
        <div className="flex items-center">
          <div className={`w-4 h-4 rounded-full ${
            syncStats?.is_online ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span className="mr-3">
            {syncStats?.is_online ? 'متصل بالإنترنت' : 'غير متصل'}
          </span>
        </div>
      </Card>
      
      {/* عدد العمليات */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <Card>
          <h3>قيد الانتظار</h3>
          <p className="text-3xl font-bold text-orange-600">
            {syncStats?.pending_count || 0}
          </p>
        </Card>
        
        <Card>
          <h3>تمت المزامنة</h3>
          <p className="text-3xl font-bold text-green-600">
            {syncStats?.synced_count || 0}
          </p>
        </Card>
        
        <Card>
          <h3>فشلت</h3>
          <p className="text-3xl font-bold text-red-600">
            {syncStats?.failed_count || 0}
          </p>
        </Card>
      </div>
      
      {/* آخر مزامنة */}
      <Card className="mt-6">
        <h3>آخر مزامنة ناجحة</h3>
        <p>{syncStats?.last_sync_at || 'لم تتم بعد'}</p>
      </Card>
      
      {/* زر مزامنة يدوية */}
      <Button 
        onClick={() => triggerManualSync()}
        className="mt-6"
      >
        مزامنة يدوية
      </Button>
    </div>
  );
}
```

---

## 🚨 **معالجة الأخطاء (Error Handling)**

### **1️⃣ انقطاع الإنترنت أثناء العملية:**
```
✅ العملية تكتمل محلياً
✅ تسجل في Sync Queue
✅ لا توقف للعمل
✅ تظهر رسالة: "تم الحفظ محلياً، سيتم المزامنة عند توفر الإنترنت"
```

### **2️⃣ فشل المزامنة بعد 3 محاولات:**
```
✅ status = 'failed'
✅ تنبيه فوري للمدير
✅ إمكانية إعادة المحاولة يدوياً
✅ تسجيل في Audit Log
```

### **3️⃣ تعارض البيانات (Conflict):**
```
استراتيجية الحل:
1. Local First = المحلي له الأولوية
2. Last Write Wins = آخر تعديل يفوز
3. Timestamps للمقارنة
4. إشعار المدير في حالة تعارض مهم
```

---

## 💾 **النسخ الاحتياطي (Backup)**

### **نوعان من النسخ:**

**1️⃣ نسخة احتياطية محلية:**
```bash
# تلقائياً كل يوم في 2 صباحاً
pg_dump minimarket > /backups/minimarket_$(date +%Y%m%d).sql

# الاحتفاظ بآخر 30 يوم
```

**2️⃣ نسخة احتياطية سحابية:**
```
✅ تتم تلقائياً عند المزامنة
✅ Cloud PostgreSQL Continuous Backup
✅ Point-in-Time Recovery
✅ تشفير كامل
```

### **الاستعادة:**

```python
# استعادة من نسخة محلية
@app.post("/api/backup/restore")
async def restore_backup(backup_file, current_user):
    # فقط المالك
    if current_user.role != "Owner":
        raise HTTPException(403, "غير مصرح")
    
    try:
        # 1. إيقاف جميع العمليات
        await stop_all_services()
        
        # 2. استعادة قاعدة البيانات
        subprocess.run([
            "psql",
            "minimarket",
            "<",
            f"/backups/{backup_file}"
        ])
        
        # 3. التحقق من السلامة
        await verify_database_integrity()
        
        # 4. إعادة تشغيل الخدمات
        await start_all_services()
        
        return {"success": True}
        
    except Exception as e:
        # Rollback
        raise HTTPException(500, f"فشلت الاستعادة: {str(e)}")
```

---

## 📊 **إحصائيات المزامنة**

### **API Endpoint:**

```python
@app.get("/api/sync/status")
async def get_sync_status():
    # عدد السجلات حسب الحالة
    pending = await db.sync_queue.count({"status": "pending"})
    synced = await db.sync_queue.count({"status": "synced"})
    failed = await db.sync_queue.count({"status": "failed"})
    
    # آخر مزامنة ناجحة
    last_sync = await db.sync_queue.find_one(
        {"status": "synced"},
        sort=[("synced_at", -1)]
    )
    
    # حالة الإنترنت
    is_online = await check_internet_connection()
    
    # حجم Queue
    queue_size = pending + failed
    
    return {
        "is_online": is_online,
        "pending_count": pending,
        "synced_count": synced,
        "failed_count": failed,
        "queue_size": queue_size,
        "last_sync_at": last_sync["synced_at"] if last_sync else None,
        "health": "good" if queue_size < 100 else "warning"
    }
```

---

## ✅ **الخلاصة**

### **المزايا:**
✅ **صفر توقف** - العمل مستمر دائماً
✅ **سرعة فائقة** - كل شيء محلي
✅ **حماية كاملة** - نسخ احتياطي مزدوج
✅ **مزامنة ذكية** - تلقائياً في الخلفية
✅ **معالجة أخطاء** - retry logic + تنبيهات
✅ **شفافية** - صفحة مراقبة كاملة

### **الضمانات:**
✅ **لن تفقد أي بيانات** - حتى مع انقطاع الإنترنت
✅ **لن يتوقف البيع** - مهما حدث
✅ **استعادة سريعة** - في حالة الطوارئ
✅ **تتبع كامل** - Audit Log لكل شيء

---

**هل هذا واضح؟ أم تريد توضيحات إضافية؟** 🚀
