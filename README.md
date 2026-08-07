Deploy guide (EN)
-----------------
1. Connect GitHub repo to Hostinger (Create App / Deploy Web App).
2. Set project root to 'market-backend'.
3. Build command: pip install -r requirements.txt
4. Start command: uvicorn server:app --host 0.0.0.0 --port $PORT (Procfile exists)
5. Add secrets in Hostinger: MONGO_URL, ADMIN_PASSWORD, etc.
6. Deploy and monitor build/runtime logs.

دليل النشر (العربية)
-------------------
1. اربط مستودع GitHub بلوحة Hostinger (Create App).
2. جذر المشروع: 'market-backend'.
3. أمر البناء: pip install -r requirements.txt
4. أمر التشغيل: uvicorn server:app --host 0.0.0.0 --port $PORT (يتوفر Procfile).
5. أضف الأسرار في Hostinger: MONGO_URL، ADMIN_PASSWORD، إلخ.
6. نفّذ النشر وراجع سجلات البناء والتشغيل.
7. web: bash -c "cd market-backend && uvicorn server:app --host 0.0.0.0 --port $PORT"
8. mkdir -p .github/workflows
# احفظ الملفات كما في الأعلى:
# .github/workflows/ci-build-and-publish.yml
# hostinger.yaml
# README_DEPLOY.md
git add .github/workflows/ci-build-and-publish.yml hostinger.yaml README_DEPLOY.md Procfile
git commit -m "Add CI workflow, hostinger config and deployment README"
git push origin main
