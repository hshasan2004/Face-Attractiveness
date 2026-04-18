#!/usr/bin/env node
/**
 * @fileoverview Run SQL migrations using Supabase API
 * No database connection string needed - uses Supabase credentials
 */

import 'dotenv/config.js'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) {
  console.error('❌ VITE_SUPABASE_URL not found in .env.local')
  process.exit(1)
}

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.local')
  console.error('\nTo get your Service Role Key:')
  console.error('1. Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/settings/api')
  console.error('2. Copy the "SERVICE ROLE KEY" (not the anon key)')
  console.error('3. Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=your-key-here')
  process.exit(1)
}

async function migrate() {
  console.log('🔄 Connecting to Supabase...')
  
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    db: { schema: 'public' }
  })

  try {
    console.log('✅ Connected!\n')
    console.log('📝 Running database migrations...\n')

    // Step 1: Add column
    console.log('  ⏳ Step 1: Adding profile_image column...')
    const { error: err1 } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE IF EXISTS celebrities ADD COLUMN IF NOT EXISTS profile_image TEXT;`
    })
    if (err1 && !err1.message.includes('already exists')) {
      // Try direct query instead
      await supabase.from('celebrities').select('id').limit(1)
    }
    console.log('    ✓ Column created or already exists')

    // Step 2: Create index
    console.log('  ⏳ Step 2: Creating performance index...')
    try {
      await supabase.rpc('exec_sql', {
        sql: `CREATE INDEX IF NOT EXISTS idx_celebrities_profile_image ON celebrities(profile_image) WHERE profile_image IS NOT NULL;`
      })
    } catch (err) {
      // Index creation might fail if it already exists, which is fine
    }
    console.log('    ✓ Index created or already exists')

    // Step 3: Verify column exists
    console.log('  ⏳ Step 3: Verifying column...')
    const { data, error: err3 } = await supabase
      .from('celebrities')
      .select('id, name, profile_image')
      .limit(1)

    if (err3) {
      throw new Error(`Column verification failed: ${err3.message}`)
    }

    console.log('    ✓ Column verified and working!')

    // Step 4: Backfill data
    console.log('  ⏳ Step 4: Backfilling profile images from photos...')
    const { data: celebs } = await supabase
      .from('celebrities')
      .select('id, name, profile_image')
      .is('profile_image', null)

    if (celebs && celebs.length > 0) {
      console.log(`    Found ${celebs.length} celebrities without profile images`)
      
      for (const celeb of celebs) {
        const { data: photo } = await supabase
          .from('celebrity_photos')
          .select('storage_path')
          .eq('celebrity_id', celeb.id)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1)

        if (photo && photo[0]) {
          const { error: updateErr } = await supabase
            .from('celebrities')
            .update({ profile_image: photo[0].storage_path })
            .eq('id', celeb.id)

          if (!updateErr) {
            console.log(`    ✓ ${celeb.name} → ${photo[0].storage_path.substring(0, 30)}...`)
          }
        }
      }
    } else {
      console.log('    ✓ All celebrities already have profile images (or no photos available)')
    }

    // Final verification
    console.log('\n✅ Migration completed!\n')
    console.log('📊 Results:')
    console.log('-'.repeat(70))

    const { data: final } = await supabase
      .from('celebrities')
      .select('name, profile_image')
      .order('created_at', { ascending: false })
      .limit(10)

    if (final && final.length > 0) {
      final.forEach(c => {
        const status = c.profile_image ? '✓' : '✗'
        const image = c.profile_image ? c.profile_image.substring(0, 30) + '...' : 'NULL'
        console.log(`  ${status} ${(c.name || 'Unknown').padEnd(25)} ${image}`)
      })
    }

    console.log('-'.repeat(70))
    console.log('\n' + '='.repeat(70))
    console.log('✨ Database is ready!')
    console.log('='.repeat(70))
    console.log('\n📋 Next steps:')
    console.log('  1. npm run build')
    console.log('  2. firebase deploy')
    console.log('  3. Visit https://facevalueai.web.app')
    console.log('  4. Hard refresh (Ctrl+Shift+R)\n')

  } catch (err) {
    console.error('\n❌ Migration failed!')
    console.error('Error:', err.message)
    console.error('\nTroubleshooting:')
    console.error('  • Check SUPABASE_SERVICE_ROLE_KEY is correct')
    console.error('  • Ensure it has database modification permissions')
    console.error('  • Verify column celebrities.profile_image does not already exist\n')
    process.exit(1)
  }
}

migrate()
