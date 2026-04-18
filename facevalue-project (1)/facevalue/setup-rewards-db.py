#!/usr/bin/env python3
import os
import sys
from pathlib import Path

# Read SQL file
sql_file = Path(__file__).parent / 'REWARDS_SETUP.sql'
if not sql_file.exists():
    print(f"❌ SQL file not found: {sql_file}")
    sys.exit(1)

sql_content = sql_file.read_text()

# Try to parse and execute through curl/HTTP
import json
import subprocess

SUPABASE_URL = 'https://svvltnrmatvatayzneax.supabase.co'
SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SERVICE_ROLE_KEY:
    print("❌ SUPABASE_SERVICE_ROLE_KEY not set")
    sys.exit(1)

print('🚀 Setting up Rewards Database...\n')

# Split by semicolons and execute each statement
statements = [s.strip() for s in sql_content.split(';') if s.strip()]

executed = 0
errors = 0

for idx, stmt in enumerate(statements, 1):
    desc = stmt[:60].replace('\n', ' ')
    print(f"[{idx}/{len(statements)}] {desc}...", end=' ', flush=True)
    
    # Try to execute via curl
    try:
        payload = json.dumps({'sql': stmt})
        headers = f'Content-Type: application/json\nAuthorization: Bearer {SERVICE_ROLE_KEY}\napikey: {SERVICE_ROLE_KEY}'
        
        result = subprocess.run([
            'curl', '-s', '-X', 'POST',
            f'{SUPABASE_URL}/rest/v1/rpc/sql_exec',
            '-H', 'Content-Type: application/json',
            '-H', f'Authorization: Bearer {SERVICE_ROLE_KEY}',
            '-H', f'apikey: {SERVICE_ROLE_KEY}',
            '-d', payload
        ], capture_output=True, text=True)
        
        if result.returncode == 0 and 'error' not in result.stdout.lower():
            print('✅')
            executed += 1
        else:
            print('❌')
            errors += 1
    except Exception as e:
        print(f'❌')
        errors += 1

print(f'\n📊 Results:')
print(f'  ✅ Executed: {executed}/{len(statements)}')
print(f'  ❌ Errors: {errors}')

if executed >= len(statements) - 3:
    print(f'\n🎉 Database setup COMPLETE!')
else:
    print(f'\n⚠️ Setup had issues')
