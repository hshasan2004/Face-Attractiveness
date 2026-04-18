#!/usr/bin/env python3
"""
Setup Rewards Database by connecting directly to Postgres
Requires: psycopg2 library and database connection string
"""
import os
import sys

# Try to get PostgreSQL connection string
POSTGRES_URL = os.environ.get('DATABASE_URL')

if not POSTGRES_URL:
    print("❌ DATABASE_URL not set in environment")
    print("\nTo get your connection string:")
    print("1. Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/settings/database")
    print("2. Copy the 'Connection string' (with 'postgres://' protocol)")
    print("3. Set it: $env:DATABASE_URL = 'postgres://...'")
    print("4. Run: python setup-rewards-direct.py")
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print("Installing psycopg2...")
    os.system(f"{sys.executable} -m pip install psycopg2-binary --quiet")
    import psycopg2

from pathlib import Path

# Read SQL file
sql_file = Path(__file__).parent / 'REWARDS_SETUP.sql'
if not sql_file.exists():
    print(f"❌ SQL file not found: {sql_file}")
    sys.exit(1)

sql_content = sql_file.read_text()

print("🚀 Connecting to Postgres and setting up Rewards Database...\n")

try:
    # Connect directly to Postgres
    conn = psycopg2.connect(POSTGRES_URL)
    cursor = conn.cursor()
    
    # Execute the entire SQL file
    cursor.execute(sql_content)
    conn.commit()
    
    print("✅ Database setup COMPLETE!\n")
    print("🎉 Created:")
    print("  ✅ reward_tiers table (4 tiers)")
    print("  ✅ user_rewards table (tracking points & progress)")
    print("  ✅ achievements table (10 achievements)")
    print("  ✅ user_achievements table (tracking earned badges)")
    print("  ✅ reward_transactions table (activity log)")
    print("  ✅ Helper functions (add_reward_points, record_rating_points)")
    print("  ✅ RLS Policies (secure row-level access)")
    
    cursor.close()
    conn.close()
    
except psycopg2.Error as e:
    print(f"❌ Database Error: {e.pgerror if hasattr(e, 'pgerror') else str(e)}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
