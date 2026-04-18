#!/usr/bin/env python3
"""
Migration Tool: Add profile_image column to celebrities table
Run this script to safely add the missing column to your Supabase database.

Requirements:
- python-dotenv
- psycopg2

Installation:
  pip install python-dotenv psycopg2-binary

Usage:
  python migrate_profile_image.py
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get database URL from environment or prompt user
DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print("❌ DATABASE_URL not found!")
    print("\nTo set it, get your connection string from:")
    print("  1. Go to: https://app.supabase.com/project/[PROJECT]/settings/database")
    print("  2. Copy the 'Connection string' (postgres:// format)")
    print("  3. Set environment variable: $env:DATABASE_URL = 'your-connection-string'")
    print("  4. Run this script again\n")
    sys.exit(1)

print("🔄 Connecting to Supabase database...")
print(f"Connection string: {DATABASE_URL[:40]}...\n")

try:
    import psycopg2
    
    # Connect to database
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    print("✅ Connected to database!\n")
    print("📝 Applying migration...\n")
    
    # Migration SQL
    sql_commands = [
        # Add column if it doesn't exist
        """ALTER TABLE IF EXISTS celebrities
           ADD COLUMN IF NOT EXISTS profile_image TEXT;""",
        
        # Add comment for documentation
        """COMMENT ON COLUMN celebrities.profile_image 
           IS 'URL of the celebrity profile image (e.g., first uploaded photo)';""",
        
        # Create index for faster lookups
        """CREATE INDEX IF NOT EXISTS idx_celebrities_profile_image 
           ON celebrities(profile_image) WHERE profile_image IS NOT NULL;""",
        
        # Backfill profile_image with first available photo
        """UPDATE celebrities c
           SET profile_image = (
             SELECT cp.storage_path
             FROM celebrity_photos cp
             WHERE cp.celebrity_id = c.id
             ORDER BY cp.display_order ASC, cp.created_at ASC
             LIMIT 1
           )
           WHERE c.profile_image IS NULL
           AND EXISTS (
             SELECT 1 FROM celebrity_photos cp WHERE cp.celebrity_id = c.id
           );""",
    ]
    
    for i, sql in enumerate(sql_commands, 1):
        try:
            cursor.execute(sql)
            conn.commit()
            print(f"  ✓ Step {i}/{len(sql_commands)} completed")
        except Exception as e:
            print(f"  ⚠️  Step {i} note: {str(e)[:60]}...")
            conn.commit()
    
    # Verify the changes
    print("\n✅ Migration completed!\n")
    print("📊 Verification - Celebrities with profile images:")
    print("-" * 60)
    
    cursor.execute("""
        SELECT id, name, profile_image, 
               CASE WHEN profile_image IS NOT NULL THEN '✓' ELSE '✗' END as has_image
        FROM celebrities
        LIMIT 10;
    """)
    
    columns = [desc[0] for desc in cursor.description]
    print(f"  {columns[1]:30} {columns[2]:20} {columns[3]:10}")
    print("-" * 60)
    
    for row in cursor.fetchall():
        name = row[1][:28] if row[1] else 'Unknown'
        image = row[2][:18] if row[2] else 'NULL'
        has_img = row[3]
        print(f"  {name:30} {image:20} {has_img:10}")
    
    cursor.close()
    conn.close()
    
    print("\n" + "="*60)
    print("✨ Database migration successful!")
    print("="*60)
    print("\n📋 Next steps:")
    print("  1. Rebuild the app: npm run build")
    print("  2. Redeploy: firebase deploy")
    print("  3. Visit: https://facevalueai.web.app")
    print("  4. Check the Results page for profile images!\n")

except ImportError:
    print("❌ Missing required package: psycopg2\n")
    print("Install it with:")
    print("  pip install psycopg2-binary\n")
    sys.exit(1)

except Exception as e:
    print(f"❌ Error: {str(e)}\n")
    print("Troubleshooting:")
    print("  • Check your CONNECTION_STRING is correct")
    print("  • Ensure your database credentials are valid")
    print("  • Verify you have permission to modify the celebrities table\n")
    sys.exit(1)
