---
name: MiniMarket auth credentials
description: Demo admin login seeded on startup
---

Admin account seeded on every cold start (when not already in DB):
- username: admin  |  email: admin@market.com  |  password: Admin@2026

Login endpoint: POST /api/auth/login  — body field is `email_or_username` (not `username`).
JWT stored in localStorage as `mm_token`.

**Why:** server.py seeds from ADMIN_EMAIL/ADMIN_PASSWORD env vars; defaults shown above.
