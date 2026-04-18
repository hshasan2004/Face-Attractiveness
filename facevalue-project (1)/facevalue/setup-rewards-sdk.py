#!/usr/bin/env python3
"""
Setup Rewards Database using Supabase Python SDK
"""
import os
from pathlib import Path
from supabase import create_client, Client

SUPABASE_URL = "https://svvltnrmatvatayzneax.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_SERVICE_ROLE_KEY:
    print("❌ ERROR: SUPABASE_SERVICE_ROLE_KEY not set in environment")
    print("\nSet it and try again:")
    print("  $env:SUPABASE_SERVICE_ROLE_KEY = 'your-key-here'")
    print("  python setup-rewards-db.py")
    exit(1)

# Initialize Supabase client with service role
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Read SQL file
sql_file = Path(__file__).parent / 'REWARDS_SETUP.sql'
if not sql_file.exists():
    print(f"❌ SQL file not found: {sql_file}")
    exit(1)

sql_content = sql_file.read_text()

print("🚀 Setting up Rewards Database...\n")

# Split into individual statements
statements = [s.strip() for s in sql_content.split(';') if s.strip() and not s.strip().startswith('--')]

executed = 0
errors = []

for idx, sql in enumerate(statements, 1):
    if not sql.strip():
        continue
    
    # Show progress
    desc = sql.strip()[:60].replace('\n', ' ')
    print(f"[{idx}/{len(statements)}] {desc}...", end=' ', flush=True)
    
    try:
        # Execute via raw SQL through Supabase
        result = supabase.postgrest.from_('_internal').select('1', count='exact').execute()
        # If we get here, connection works
        # But PostgREST can't execute arbitrary SQL, so we'll fail gracefully
        print("⚠️ (can't execute via PostgREST)")
        errors.append(('Method limitation', 'PostgREST API cannot execute arbitrary SQL'))
        break
        
    except Exception as e:
        print(f"❌ ({str(e)[:40]}...)")
        errors.append((sql[:30], str(e)))

print(f"\n📊 Results:")
print(f"  ✅ Executed: {executed}/{len(statements)}")
print(f"  ❌ Errors: {len(errors)}")

if errors:
    print(f"\n⚠️ Note: PostgREST API cannot execute arbitrary SQL directly.")
    print("Use the Supabase SQL Editor or psql instead:")
    print("\n  1. Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/sql/new")
    print("  2. Copy content from: REWARDS_SETUP.sql")
    print("  3. Paste and run in the editor")
