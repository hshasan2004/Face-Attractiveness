#!/usr/bin/env node
/**
 * @fileoverview Database migration to add profile_image column
 * Connects directly to Supabase and creates the missing column
 *
 * Usage:
 *   node migrate_profile_image_lite.mjs
 *
 * Setup:
 * 1. Get your Supabase connection string from:
 *    https://app.supabase.com/project/[PROJECT]/settings/database
 * 2. Create a .env file in this directory with:
 *    DATABASE_URL=postgres://[USER]:[PASSWORD]@[HOST]:5432/postgres
 * 3. Run: node migrate_profile_image_lite.mjs
 */

import 'dotenv/config.js'
import pkg from 'pg'
const { Client } = pkg

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error(
    '❌ DATABASE_URL environment variable not found!\n' +
    '\nSetup Instructions:\n' +
    '1. Get your connection string from Supabase:\n' +
    '   https://app.supabase.com/project/svvltnrmatvatayzneax/settings/database\n' +
    '2. In PowerShell, set it:\n' +
    '   $env:DATABASE_URL = "postgres://user:password@host:5432/postgres"\n' +
    '3. Run this script again\n'
  )
  process.exit(1)
}

async function migrate() {
  const client = new Client({ connectionString })

  try {
    console.log('🔄 Connecting to Supabase database...')
    await client.connect()
    console.log('✅ Connected!\n')

    console.log('📝 Applying migration...\n')

    // Step 1: Add column
    console.log('  ⏳ Adding profile_image column...')
    try {
      await client.query(`
        ALTER TABLE IF EXISTS celebrities
        ADD COLUMN IF NOT EXISTS profile_image TEXT;
      `)
      console.log('    ✓ Column added')
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('    ✓ Column already exists')
      } else {
        throw err
      }
    }

    // Step 2: Add comment
    console.log('  ⏳ Adding documentation...')
    try {
      await client.query(`
        COMMENT ON COLUMN celebrities.profile_image 
        IS 'URL of the celebrity profile image (e.g., first uploaded photo)';
      `)
      console.log('    ✓ Documentation added')
    } catch (err) {
      console.log('    ℹ️  Comment skipped')
    }

    // Step 3: Create index
    console.log('  ⏳ Creating index for faster queries...')
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_celebrities_profile_image 
        ON celebrities(profile_image) WHERE profile_image IS NOT NULL;
      `)
      console.log('    ✓ Index created')
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('    ✓ Index already exists')
      } else {
        throw err
      }
    }

    // Step 4: Backfill data
    console.log('  ⏳ Backfilling profile images from existing photos...')
    const result = await client.query(`
      UPDATE celebrities c
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
      );
    `)
    console.log(`    ✓ Updated ${result.rowCount} celebrities\n`)

    // Verify
    console.log('✅ Migration completed!\n')
    console.log('📊 Verification - Sample celebrities:')
    console.log('-'.repeat(70))

    const verification = await client.query(`
      SELECT 
        name,
        SUBSTRING(profile_image, 1, 35) as image_preview,
        CASE WHEN profile_image IS NOT NULL THEN '✓' ELSE '✗' END as has_image
      FROM celebrities
      ORDER BY created_at DESC
      LIMIT 10;
    `)

    console.log('  Celebrity Name          | Image Preview               | Status')
    console.log('-'.repeat(70))
    verification.rows.forEach(row => {
      const name = (row.name || 'Unknown').padEnd(23)
      const image = (row.image_preview || 'NULL').padEnd(27)
      const status = row.has_image
      console.log(`  ${name} | ${image} | ${status}`)
    })

    console.log('\n' + '='.repeat(70))
    console.log('✨ Database migration successful!')
    console.log('='.repeat(70))
    console.log('\n📋 Next steps:')
    console.log('  1. Rebuild the app: npm run build')
    console.log('  2. Redeploy: firebase deploy')
    console.log('  3. Visit: https://facevalueai.web.app')
    console.log('  4. Hard refresh (Ctrl+Shift+R) and check Results page!\n')

  } catch (err) {
    console.error('❌ Migration failed!')
    console.error('Error:', err.message)
    console.error('\nTroubleshooting:')
    console.error('  • Check your DATABASE_URL is correct')
    console.error('  • Ensure credentials are valid')
    console.error('  • Verify you have ALTER TABLE permissions\n')
    process.exit(1)
  } finally {
    await client.end()
  }
}

migrate()
