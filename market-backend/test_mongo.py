# test_mongo.py
"""
Simple MongoDB connection test used for local development.
Reads MONGO_URL from the environment and sends a ping to confirm connectivity.

Usage:
  # set MONGO_URL in your environment or copy market-backend/.env.example -> market-backend/.env
  export MONGO_URL='mongodb+srv://USER:PASS@cluster0.../market_db?retryWrites=true&w=majority'
  python market-backend/test_mongo.py

This file is safe to commit because it does not contain secrets.
"""
import os
import sys
from urllib.parse import quote_plus
from pymongo import MongoClient
from pymongo.server_api import ServerApi

uri = os.environ.get("MONGO_URL")
if not uri:
    print("MONGO_URL not set. Create market-backend/.env or export MONGO_URL before running.")
    sys.exit(1)

# Create client with a reasonable timeout
client = MongoClient(uri, server_api=ServerApi('1'), serverSelectionTimeoutMS=5000)

try:
    client.admin.command('ping')
    print("Ping successful — connected to MongoDB.")
except Exception as e:
    print("Connection failed:", e)
finally:
    client.close()
