---
name: MiniMarket MongoDB setup
description: MongoDB Atlas credentials are wrong; mongomock fallback gates dev/demo mode
---

The MONGO_URL env var points to an Atlas cluster with bad credentials (auth fails).
`database.py` tries a real ping; if it fails and `ALLOW_MONGOMOCK=true` is set, it falls back to in-memory mongomock (data lost on restart).

**Why:** ALLOW_MONGOMOCK must be explicit so production misconfigurations don't silently lose data.

**How to apply:** `ALLOW_MONGOMOCK=true` is set in shared env vars for this dev/demo repl. To use a real Atlas cluster, fix MONGO_URL credentials and remove or set ALLOW_MONGOMOCK=false.
