#!/bin/bash
cd /home/runner/workspace/market-backend
exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 2
