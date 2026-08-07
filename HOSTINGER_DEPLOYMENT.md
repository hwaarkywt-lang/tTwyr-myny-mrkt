# نشر التطبيق على Hostinger — دليل مُهيأ

هذا الملف يشرح خطوات نشر تطبيق "Mini Market Management System" (الموجود في مجلد `market-backend`) على Hostinger باستخدام واجهة نشر التطبيقات (Deploy / Publish Web App) أو عبر ربط GitHub. يحتوي على تعليمات إعدادية، متغيرات بيئة مطلوبة، ومقترحات للتشغـيل الآمن.

ملاحظات قبل البدء
- لا تضع أي أسرار (مثل كلمات المرور أو سلاسل الاتصال) في هذا المستودع. استعمل متغيرات البيئة في Hostinger أو Secret manager.
- افترض أن الكود الرئيسي للتطبيق موجود في `market-backend/` وملف بدء التشغيل هو `server.py` الذي يحتوي على متغيرات البيئة ويدعم uvicorn.
- يوجد في جذر المستودع: `Procfile` مُعدّ لتشغيل التطبيق عبر:

  web: bash -c "cd market-backend && uvicorn server:app --host 0.0.0.0 --port $PORT"

ملف Procfile يجعل Hostinger أو أي مزوّد يعتمد Procfile يقوم بتشغيل الأمر الصحيح تلقائيًا.

المتغيرات البيئية (في Hostinger UI — Environment / Secrets)
- MONGO_URL — سلسلة الاتصال إلى MongoDB (مثلاً من MongoDB Atlas). مثال:
  mongodb+srv://<USER>:<PASSWORD>@cluster0.xxxxx.mongodb.net/market_db?retryWrites=true&w=majority
- DB_NAME — (اختياري) اسم قاعدة البيانات، مثل `market_db`.
- ADMIN_EMAIL — البريد الإداري الافتراضي (مثلاً admin@market.com).
- ADMIN_PASSWORD — كلمة مرور المسؤول الأولي (ضع قيمة قوية ولا تشاركها).
- CORS_ORIGINS — مصادر المسموح بها (مثلاً `*` أثناء الاختبار أو قائمة النطاقات مفصولة بفواصل).

خطوات الربط والنشر على Hostinger (باستخدام GitHub)
1. في Hostinger: اختر Create App / Deploy Web App → اختر GitHub → امنح الأذونات اللازمة.  
2. اختر المستودع (اسم المستودع) والفرع (مثلاً `main`).  
3. في إعدادات المشروع (Project / Root folder) ضع: `market-backend`  
4. Build / Install command: ضع:
   ```bash
   pip install -r requirements.txt
   ```
   (بعض واجهات Hostinger تسمح بوضع أمر واحد فقط، وبعضها يقرأ Procfile ويشغّل أمر Start تلقائيًا).
5. Start command: اترك Procfile يُستخدم أو ضع صراحةً:
   ```bash
   uvicorn server:app --host 0.0.0.0 --port $PORT
   ```
6. أضف متغيرات البيئة المذكورة أعلاه في صفحة Environment/Secrets.
7. شغّل Deploy ومراقبة الـ Build logs وRuntime logs.

ملاحظات حول MongoDB Atlas
- استضافة مشتركة عادةً لا تتيح تثبيت MongoDB محليًا، لذا يُنصح باستخدام MongoDB Atlas أو أي خدمة مُدارة.
- في Atlas: اذهب إلى Network Access وأضف عنوان IP الخاص بخدمة Hostinger إن طُلب (أو استخدم 0.0.0.0/0 مؤقتًا أثناء الاختبار ثم ضيّقه لاحقًا).
- أنشئ مستخدمًا في Database Access وأعطه صلاحيات مناسبة ثم استخدم بياناته في MONGO_URL.

اختبار محلي قبل النشر (موصى به)
1. انسخ القالب المحلي للمتغيرات:
   ```bash
   cp market-backend/.env.example market-backend/.env
   # ثم حرر market-backend/.env وضع قيمة MONGO_URL
   ```
2. شغّل الخدمات المحلية (إن أردت تشغيل Mongo عبر docker-compose):
   ```bash
   docker compose up -d --build
   ```
3. أو شغّل التطبيق محليًا (بدون Docker):
   ```bash
   python -m venv .venv
   source .venv/bin/activate    # Windows: .venv\Scripts\activate
   pip install -r market-backend/requirements.txt
   uvicorn market-backend.server:app --reload --port 5000
   ```
4. تحقق من صحة التطبيق:
   ```bash
   curl http://localhost:5000/api/health
   ```

تشخيص الأخطاء الشائعة
- Build fails بسبب حزم ناقصة: تأكد من أن `market-backend/requirements.txt` يتضمن `fastapi`, `uvicorn`, `pymongo`, `python-dotenv`، وغيرها المطلوبة.
- Application crashes on start: راجع Runtime logs في Hostinger، غالبًا خطأ في `MONGO_URL` أو متغير بيئة مفقود يؤدي لفشل الإقلاع.
- ERR_CONNECTION_REFUSED: تأكد من أن العملية بدأت وأن Hostinger ربط الـ $PORT بشكل صحيح.

نشر عبر VPS (بديل إذا لديك SSH + Docker)
- إذا كنت تمتلك VPS على Hostinger (أو أي مزود)، أنصح بتشغيل عبر Docker Compose لتشغيل `mongo` و`backend` معًا. اضبط `docker-compose.yml` ليضم خدمة `backend` ثم:
  ```bash
  docker compose up -d --build
  ```

أمنية ونصائح نهائية
- لا تُدخِل أسرارك في الملفات المتتبعة في Git. استخدم متغيرات البيئة في Hostinger (Environment/Secrets).  
- إن تسربت بيانات اعتماد في أي مكان، دوّرها فورًا (في Atlas → Database Access → Edit user → Change password).  
- حدّد سياسات الوصول في Atlas بدلاً من ترك 0.0.0.0/0 بعد الاختبارات.

ملفات مفيدة في المستودع
- `Procfile` — لتشغيل التطبيق على Hostinger.  
- `market-backend/Dockerfile` — لبناء صورة الحاوية إن رغبت بنشر Docker.  
- `docker-compose.yml` — تشغيل محلي أو على VPS.

هل تريد أن أضع ملف إعداد Hostinger آخر (مثلاً hostinger.yaml أو README مفصّل بالعربي والإنجليزي) أو أدخل التعديلات على `market-backend/requirements.txt` أو أتحقق من سجلات نشر على Hostinger؟ أخبرني وسأتابع تنفيذ التغييرات الآمنة في المستودع.