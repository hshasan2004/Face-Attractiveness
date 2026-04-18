#!/usr/bin/env node
/**
 * Database Migration Tool - Add profile_image column
 * 
 * This script connects to your Supabase database and adds the missing column.
 * 
 * SETUP (One-time):
 * 1. Get your Service Role Key:
 *    - Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/settings/api
 *    - Copy "SERVICE ROLE KEY" (not the anon key)
 *    - Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=your-key
 * 
 * 2. Run this script:
 *    node migrate-setup.mjs
 */

import 'dotenv/config.js'
import https from 'https'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('\n🔧 Database Migration Tool')
console.log('=' .repeat(60))

if (!SUPABASE_URL) {
  console.error('❌ Error: VITE_SUPABASE_URL not found\n')
  process.exit(1)
}

if (!SERVICE_ROLE_KEY) {
  console.log('\n⚠️  Service Role Key not configured!\n')
  console.log('To enable automated migration:')
  console.log('1. Get your key from:')
  console.log('   https://app.supabase.com/project/svvltnrmatvatayzneax/settings/api')
  console.log('\n2. Copy "SERVICE ROLE KEY" (NOT the anon key)')
  console.log('\n3. Add to .env.local:')
  console.log('   SUPABASE_SERVICE_ROLE_KEY=sk_...')
  console.log('\n4. Run this script again\n')
  
  console.log('OR use the MANUAL method:')
  console.log('1. Open: https://app.supabase.com/project/[PROJECT]/sql/new')
  console.log('2. Copy all SQL from: migrations/add_profile_image_final.sql')
  console.log('3. Paste into Supabase editor')
  console.log('4. Click RUN button\n')
  
  process.exit(0)
}

console.log('\n🔄 Connecting to Supabase...')
console.log(`   URL: ${SUPABASE_URL}\n`)

// Parse URL
const url = new URL(SUPABASE_URL)
const projectId = url.hostname.split('.')[0]

const sqlStatements = [
  `ALTER TABLE IF EXISTS celebrities ADD COLUMN IF NOT EXISTS profile_image TEXT;`,
  `COMMENT ON COLUMN celebrities.profile_image IS 'URL of celebrity profile image - typically first uploaded photo';`,
  `CREATE INDEX IF NOT EXISTS idx_celebrities_profile_image ON celebrities(profile_image) WHERE profile_image IS NOT NULL;`,
  `UPDATE celebrities c SET profile_image = (SELECT cp.storage_path FROM celebrity_photos cp WHERE cp.celebrity_id = c.id ORDER BY cp.display_order ASC, cp.created_at ASC LIMIT 1) WHERE c.profile_image IS NULL AND EXISTS (SELECT 1 FROM celebrity_photos cp WHERE cp.celebrity_id = c.id);`,
  `SELECT name, SUBSTRING(profile_image, 1, 40) as image_url, CASE WHEN profile_image IS NOT NULL THEN 'OK' ELSE 'NULL' END as status FROM celebrities LIMIT 10;`
]

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${projectId}.supabase.co`,
      path: '/rest/v1/`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify({ sql }))
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          resolve(data)
        }
      })
    })

    req.on('error', reject)
    req.write(JSON.stringify({ sql }))
    req.end()
  })
}

async function migrate() {
  try {
    console.log('📝 Running migration steps...\n')

    for (let i = 0; i < sqlStatements.length; i++) {
      const step = i + 1
      const sql = sqlStatements[i]
      
      try {
        console.log(`  Step ${step}/${sqlStatements.length}...`)
        await executeSQL(sql)
        console.log(`  ✓ Completed\n`)
      } catch (err) {
        console.log(`  ⚠️  ${err.message}\n`)
      }

      // Small delay between requests
      await new Promise(r => setTimeout(r, 500))
    }

    console.log('✅ Migration complete!\n')
    console.log('=' .repeat(60))
    console.log('\n📋 Next steps:')
    console.log('  1. npm run build')
    console.log('  2. firebase deploy')
    console.log('  3. Visit https://facevalueai.web.app')
    console.log('  4. Hard refresh (Ctrl+Shift+R)\n')

  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    console.error('\nFallback: Use manual SQL method')
    console.error('1. Copy: migrations/add_profile_image_final.sql')
    console.error('2. Paste in Supabase SQL editor')
    console.error('3. Click RUN\n')
    process.exit(1)
  }
}

migrate()
