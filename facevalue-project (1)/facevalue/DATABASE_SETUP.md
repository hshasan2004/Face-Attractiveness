# 🎮 Rewards System - Database Setup Guide

Your app is **100% ready**. Just need to run the database SQL in Supabase.

---

## ✅ Option 1: Manual Setup (Easiest - 2 minutes)

**Step 1:** Open Supabase SQL Editor
- Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/sql/new
- *(Should already be open in your browser)*

**Step 2:** Copy the SQL
- Open file: `REWARDS_SETUP.sql` (in this folder)
- Ctrl+A to select all
- Ctrl+C to copy

**Step 3:** Paste and Run
- Paste into Supabase editor (Ctrl+V)
- Click the green **RUN** button
- Wait for "Query executed successfully"
- ✅ Done!

---

## 🔄 Option 2: Using Python + Database Connection

If you have your Postgres connection string:

```bash
$env:DATABASE_URL = 'postgres://user:pass@db.supabase.co:5432/postgres'
python setup-rewards-direct.py
```

**To get your connection string:**
1. Go to: https://app.supabase.com/project/svvltnrmatvatayzneax/settings/database
2. Copy the "Connection string" (postgres:// format)
3. Set the env var and run the script above

---

## 🖥️ Option 3: Using psql Command Line

If you have `psql` installed:

```bash
psql "your-connection-string" < REWARDS_SETUP.sql
```

---

## 📊 What Gets Created

### 5 New Tables:
- `reward_tiers` - Bronze, Silver, Gold, Platinum levels
- `user_rewards` - Tracks points, tier, streaks for each user
- `achievements` - 10 built-in badges (First Rating, 100 Ratings, etc.)
- `user_achievements` - Which user earned which achievement
- `reward_transactions` - Activity log of all points earned

### 3 Helper Functions:
- `add_reward_points()` - Award points and log transaction
- `record_rating_points()` - Automatically called when rating (10 points)
- `update_user_tier()` - Auto-promote users when reaching tier thresholds

### Security:
- Row-Level Security (RLS) enabled on all tables
- Policies restrict users to their own data (can't see others' points)
- Admin can see all rewards data for analytics

---

## 🎯 How Users Earn Points

- **Rating a photo**: +10 points
- **Completing a survey**: +100 bonus points
- **Achievements**: +50-300 points each (unlocked at milestones)

**Achievements Include:**
- ⭐ First Rating (10 points)
- 🔟 10 Ratings (50 points)
- 💯 100 Ratings (150 points)
- 🏆 Survey Master (200 points)
- 🔥 7-Day Streak (100 points)
- And 5 more...

**Tier System:**
- 🥉 Bronze: 0-999 points
- 🥈 Silver: 1000-4999 points
- ⭐ Gold: 5000-9999 points
- 👑 Platinum: 10,000+ points

---

## ✨ After Setup

Your app will automatically:
1. ✅ Award points after each rating
2. ✅ Track total points & tier
3. ✅ Unlock achievements at milestones
4. ✅ Display on Rewards page (🏆 button in nav)
5. ✅ Show leaderboard of top evaluators

Users can view their progress at: **https://facevalueai.web.app/rewards**

---

## 🆘 Troubleshooting

- **"already exists" error**: Means tables are already created - that's fine!
- **"permission denied"**: Wrong account - use project owner credentials
- **"function not found"**: Some functions failed to create - check RLS policy steps

If you get any errors, just re-run the SQL - it uses `if not exists` so it's safe.

---

**Ready? Pick an option above and let me know when it's done!** ✅
