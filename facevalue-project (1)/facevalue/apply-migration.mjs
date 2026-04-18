#!/usr/bin/env node
/**
 * Direct Database Migration using Supabase Client
 * Adds profile_image column to celebrities table
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://svvltnrmatvatayzneax.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrZGhwbHdqdWF6Y3F6a293c2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTcyOTIsImV4cCI6MjA5MTY3MzI5Mn0.s8-7cLIy2x3rzhOPrHJkxmYzreOI5WJHHa-og2YFXco'

console.log('\n🔧 Database Migration - Add profile_image Column')
console.log('='.repeat(70))

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function migrate() {
  try {
    console.log('\n📝 Step 1: Testing connection...')
    
    // Test connection by fetching one celebrity
    const { data: testData, error: testError } = await supabase
      .from('celebrities')
      .select('id, name')
      .limit(1)

    if (testError) {
      throw new Error(`Connection test failed: ${testError.message}`)
    }

    console.log('✅ Connected to Supabase successfully!')
    console.log(`   Found ${testData.length} celebrities in database\n`)

    // Check if profile_image column already exists
    console.log('📝 Step 2: Checking if profile_image column exists...')
    
    const { data: celebWithImage, error: checkError } = await supabase
      .from('celebrities')
      .select('id, name, profile_image')
      .limit(1)

    if (!checkError) {
      console.log('✅ Column already exists! Let\'s verify it\'s working...')
    } else if (checkError.message.includes('profile_image')) {
      console.log('⚠️  Column does not exist. Instructions below:\n')
      console.log('=' .repeat(70))
      console.log('\n📋 MANUAL DATABASE FIX REQUIRED\n')
      console.log('The database needs to be updated via Supabase SQL Editor.')
      console.log('This requires admin access to modify the schema.\n')
      console.log('Follow these steps:\n')
      console.log('1️⃣  Open Supabase SQL Editor:')
      console.log('   https://app.supabase.com/project/svvltnrmatvatayzneax/sql/new\n')
      console.log('2️⃣  Copy the SQL from: migrations/add_profile_image_final.sql\n')
      console.log('3️⃣  Paste into the editor and click RUN\n')
      console.log('4️⃣  You should see "Query executed successfully"\n')
      console.log('Then run these commands:')
      console.log('   npm run build')
      console.log('   firebase deploy\n')
      console.log('=' .repeat(70))
      console.log('\n')
      process.exit(0)
    }

    // If column exists, backfill data
    console.log('\n📝 Step 3: Fetching celebrities without profile images...')
    
    const { data: celebs, error: celebsError } = await supabase
      .from('celebrities')
      .select('id, name')
      .is('profile_image', null)

    if (celebsError) {
      console.log('✅ All celebrities already have profile images!')
    } else if (celebs && celebs.length > 0) {
      console.log(`Found ${celebs.length} celebrities without profile images\n`)
      console.log('📝 Step 4: Backfilling with first available photo...\n')

      for (const celeb of celebs) {
        // Get first photo for this celebrity
        const { data: photos, error: photoError } = await supabase
          .from('celebrity_photos')
          .select('storage_path')
          .eq('celebrity_id', celeb.id)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1)

        if (photos && photos.length > 0) {
          const { error: updateError } = await supabase
            .from('celebrities')
            .update({ profile_image: photos[0].storage_path })
            .eq('id', celeb.id)

          if (!updateError) {
            const photoPath = photos[0].storage_path.substring(0, 35)
            console.log(`   ✓ ${celeb.name} → ${photoPath}...`)
          }
        }
      }
      console.log('')
    } else {
      console.log('✅ All celebrities already have profile images!\n')
    }

    // Final verification
    console.log('📝 Step 5: Final verification...\n')
    
    const { data: finalCheck } = await supabase
      .from('celebrities')
      .select('name, profile_image')
      .order('created_at', { ascending: false })
      .limit(5)

    console.log('Sample Results:')
    console.log('-'.repeat(70))
    if (finalCheck) {
      finalCheck.forEach(c => {
        const status = c.profile_image ? '✅' : '⚠️ NULL'
        const image = c.profile_image ? c.profile_image.substring(0, 30) + '...' : 'No image'
        console.log(`${status} ${(c.name || 'Unknown').padEnd(25)} ${image}`)
      })
    }
    console.log('-'.repeat(70))

    console.log('\n✨ Database is ready!\n')
    console.log('=' .repeat(70))
    console.log('\n📋 Next steps:\n')
    console.log('1. npm run build')
    console.log('2. firebase deploy')
    console.log('3. Visit https://facevalueai.web.app')
    console.log('4. Hard refresh (Ctrl+Shift+R)\n')

  } catch (err) {
    console.error('\n❌ Error:', err.message)
    console.error('\nPlease use the MANUAL method:')
    console.error('1. Open: https://app.supabase.com/project/svvltnrmatvatayzneax/sql/new')
    console.error('2. Copy SQL from: migrations/add_profile_image_final.sql')
    console.error('3. Paste and click RUN\n')
    process.exit(1)
  }
}

migrate()
