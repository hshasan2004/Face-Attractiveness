## 🎮 Database Setup for Rewards System

Your app is deployed and ready! But we need to create the rewards tables in Supabase.

### ⚡ Quick Setup (2 minutes)

**Step 1:** Open Supabase SQL Editor
- Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/sql/new

**Step 2:** Copy the SQL
1. Open file: `REWARDS_SETUP.sql` (in this folder)
2. Select all (Ctrl+A) and copy (Ctrl+C)

**Step 3:** Paste and Run
1. Paste the SQL into the Supabase editor
2. Click the **Run** button (or Ctrl+Enter)
3. Wait for "Query completed successfully"
4. Done! ✅

---

### 🤖 Automated Setup (Alternative)

If you have your **Supabase Service Role Key**, run this instead:

```bash
$env:SUPABASE_SERVICE_ROLE_KEY = 'YOUR-SERVICE-ROLE-KEY-HERE'
node setup-rewards-db.mjs
```

**Where to find Service Role Key:**
- Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/settings/api
- Copy the **"SERVICE ROLE KEY"** (it's a long token, different from the anon key)

---

### ✅ Verify Setup

After running the SQL, check that these tables exist in Supabase:
- `reward_tiers`
- `user_rewards`
- `achievements` (should have 10 rows)
- `user_achievements`
- `reward_transactions`

---

### 🎯 What Gets Created

**5 New Tables:**
- Reward tiers (Bronze, Silver, Gold, Platinum)
- User rewards tracking (points, tier, streaks)
- Achievements (10 built-in badges)
- User achievement tracking
- Reward transaction log

**3 Helper Functions:**
- `add_reward_points()` - Award points
- `record_rating_points()` - Track ratings
- `update_user_tier()` - Auto-promote users

**RLS Policies** - Secure row-level access

---

### 🚀 After Setup

Your app will automatically:
1. Award **10 points per rating**
2. Award **100 points per survey completion**
3. Track **achievements and streaks**
4. Show **leaderboards and progress**

Users can view it at: **"🏆 Rewards"** button in top nav

---

### 💡 Need Help?

If the manual SQL fails:
1. Check for duplicate table names (run `DROP TABLE IF EXISTS` first)
2. Ensure RLS is enabled on your Supabase project
3. Verify `public.is_admin()` function exists (from the main schema)

Good luck! 🎉
