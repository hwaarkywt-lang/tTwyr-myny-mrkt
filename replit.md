# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

This file explains the quickest way to start the Python FastAPI backend (market-backend) and local databases used during development. Do NOT commit secrets (market-backend/.env) to the repository.

- Start local databases (MongoDB + Postgres) with Docker Compose:

```bash
# from repository root
docker compose up -d
```

- Create a local environment file for the Python app (DO NOT commit):

```bash
# copy example to a local .env and edit MONGO_URL
cp market-backend/.env.example market-backend/.env
# then open market-backend/.env and set MONGO_URL to your Atlas URI or local URI
```

Example values for MONGO_URL (replace placeholders):

- Atlas (example):
```
mongodb+srv://<USER>:<PASSWORD>@cluster0.nm2q2vl.mongodb.net/market_db?retryWrites=true&w=majority
```
- Local (docker-compose):
```
mongodb://mongo:27017
```

- Install Python requirements and run the FastAPI app:

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r market-backend/requirements.txt
uvicorn market-backend.server:app --reload --port 5000
```

- Health check and verification:

  - Visit the health endpoint to confirm the app can reach the DB:

    http://localhost:5000/api/health

  - You can also connect with Compass (GUI) or mongosh to inspect data.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9 (workspace tooling)
- Python FastAPI backend (market-backend) using PyMongo / MongoDB

## Notes & Security

- NEVER commit files that contain secrets (market-backend/.env) to the repository. Use the provided `market-backend/.env.example` as a template only.
- For CI/CD or cloud deployments, put `MONGO_URL`, `ADMIN_PASSWORD`, and other secrets into your platform's secret storage (GitHub Secrets, Replit secrets, Heroku config vars, etc.).
- If the database credentials were ever exposed (screenshots, logs, or accidental commits), rotate the password immediately in Atlas → Database Access.

## Quick tools & tips

- To inspect data with a GUI: use MongoDB Compass and connect with the same MONGO_URL.
- To run a quick connection test locally, you can create a small script `test_mongo.py` that reads `MONGO_URL` from env and pings the server.

## Where things live

- `market-backend/` — Python FastAPI app, DB code, routes, and startup seeding.
- `docker-compose.yml` — starts MongoDB, Postgres (for workspace packages), and Adminer for local development.

## Gotchas

- The repository mixes Node/Postgres tooling (workspace packages) and a Python/Mongo backend. Use the appropriate DB (Postgres) only for the workspace packages that document it — the running FastAPI service expects MongoDB.

## Pointers

- Copy `market-backend/.env.example` → `market-backend/.env` locally and fill `MONGO_URL`.
- Use Docker Compose for a quick local setup and MongoDB Compass for manual inspection.
