# 🔧 Fix: Add profile_image Column to Celebrities Table

## Problem
The application errors with: `column celebrities.profile_image does not exist`

This means your Supabase database doesn't have the `profile_image` column yet, even though the schema file includes it.

## Solution - Choose One of 3 Methods

### **Method 1: Manual SQL (Easiest - 2 minutes)**

1. **Open Supabase SQL Editor**
   - Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/sql/new
   - Should already be open in your browser

2. **Copy the SQL**
   - Open: `migrations/add_profile_image.sql`
   - Ctrl+A to select all
   - Ctrl+C to copy

3. **Paste and Run**
   - Paste into Supabase editor
   - Click the green **RUN** button
   - Wait for "Query executed successfully"
   - ✅ Done!

---

### **Method 2: Node.js Migration (Automated)**

If you have Node.js:

```bash
# Set your database connection string (get from Supabase settings)
$env:DATABASE_URL = 'postgres://user:password@host:5432/postgres'

# Run the migration
node migrate_profile_image.mjs
```

Features:
✓ Adds profile_image column
✓ Creates performance index
✓ Backfills existing celebrities with their first photo
✓ Verifies results

---

### **Method 3: Python Migration (Alternative)**

If you have Python 3:

```bash
# Install dependencies
pip install python-dotenv psycopg2-binary

# Set your connection string
$env:DATABASE_URL = 'postgres://user:password@host:5432/postgres'

# Run the migration
python migrate_profile_image.py
```

---

## Getting Your Database Connection String

1. Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/settings/database
2. Look for **"Connection string"** section
3. Select **"UI"** tab
4. Copy the entire connection string (starts with `postgres://`)
5. Use this for the $env:DATABASE_URL

---

## What The Migration Does

✅ **Adds Column**
```sql
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS profile_image TEXT;
```

✅ **Creates Index** (for faster queries)
```sql
CREATE INDEX idx_celebrities_profile_image ON celebrities(profile_image) 
WHERE profile_image IS NOT NULL;
```

✅ **Backfills Data** (automatically assigns first uploaded photo)
```sql
UPDATE celebrities c
SET profile_image = (
  SELECT cp.storage_path FROM celebrity_photos cp
  WHERE cp.celebrity_id = c.id
  ORDER BY cp.display_order ASC
  LIMIT 1
)
WHERE c.profile_image IS NULL;
```

---

## After Migration - Deploy

Once the database is fixed:

```bash
# Rebuild the app
cd facevalue-project\ (1)/facevalue
npm run build

# Deploy to Firebase
cd ../..
firebase deploy
```

Then visit: https://facevalueai.web.app

Hard refresh (Ctrl+Shift+R) to see the changes!

---

## Verify It Worked

Check that celebrities now have profile images:

```sql
-- In Supabase SQL Editor, run:
SELECT name, profile_image FROM celebrities LIMIT 5;
```

You should see:
- ✓ name column populated
- ✓ profile_image column with URLs or NULL

---

## Troubleshooting

### "Column already exists" error
✅ This is OK! It means the column is already there. The app should work now.

### Query returns NULL values
This means celebrities have no photos yet. Add photos to celebrities in the admin panel.

### Still getting same error after migration
1. Hard refresh the browser (Ctrl+Shift+R)
2. Clear browser cache
3. Rebuild and redeploy the app
4. Check that your Supabase API key is correct

---

## Frontend Code Status ✅

The frontend code in `Results.jsx` is already optimized:

```javascript
// Correctly queries profile_image
const { data: celebs, error: celebsError } = await supabase
  .from('celebrities')
  .select('id, name, gender, profile_image')  // ← This column must exist
  .order('name', { ascending: true })

// Correctly displays images
{r.profileUrl && !brokenImages[r.id] ? (
  <img src={r.profileUrl} alt={r.name} ... />
) : (
  <div>/* fallback avatar */</div>
)}
```

No frontend changes are needed. Just fix the database!

---

**Need help?** Check the migration scripts for detailed error messages or contact support.
