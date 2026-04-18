import { supabase } from '../supabase/client'

/**
 * Get user's current rewards profile
 */
export async function getUserRewards(userId) {
  const { data, error } = await supabase
    .from('user_rewards')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

/**
 * Get user's achievements
 */
export async function getUserAchievements(userId) {
  const { data, error } = await supabase
    .from('user_achievements')
    .select('achievement_id, achievements(slug, title, description, icon, points_reward), earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get all available achievements
 */
export async function getAllAchievements() {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .order('id')

  if (error) throw error
  return data || []
}

/**
 * Get reward tiers
 */
export async function getRewardTiers() {
  const { data, error } = await supabase
    .from('reward_tiers')
    .select('*')
    .order('min_points')

  if (error) throw error
  return data || []
}

/**
 * Get user's reward transactions (activity log)
 */
export async function getUserTransactions(userId, limit = 10) {
  const { data, error } = await supabase
    .from('reward_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Get leaderboard (top users by points)
 */
export async function getLeaderboard(limit = 10) {
  const { data, error } = await supabase
    .from('user_rewards')
    .select('user_id, total_points, current_tier, total_ratings, user_profiles(full_name)')
    .order('total_points', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Record a rating and award points (to be called after user submits a rating)
 */
export async function awardRatingPoints(userId) {
  const { error } = await supabase.rpc('record_rating_points', {
    p_user_id: userId,
  })

  if (error) throw error
}

/**
 * Award survey completion bonus
 */
export async function awardSurveyBonus(userId, surveyId) {
  const { error } = await supabase.rpc('add_reward_points', {
    p_user_id: userId,
    p_points: 100,
    p_type: 'survey_complete',
    p_description: 'Completed a full survey',
    p_related_id: surveyId,
  })

  if (error) throw error
}

/**
 * Award achievement and bonus points (admin or system call)
 */
export async function awardAchievement(userId, achievementSlug) {
  try {
    // Get achievement details
    const { data: achievement, error: achError } = await supabase
      .from('achievements')
      .select('id, points_reward')
      .eq('slug', achievementSlug)
      .single()

    if (achError) throw achError

    // Try to insert the achievement (will fail silently if already earned)
    await supabase
      .from('user_achievements')
      .insert({
        user_id: userId,
        achievement_id: achievement.id,
      })

    // Award points for the achievement
    await supabase.rpc('add_reward_points', {
      p_user_id: userId,
      p_points: achievement.points_reward,
      p_type: 'achievement',
      p_description: `Unlocked achievement: ${achievementSlug}`,
    })

    return { success: true, achievement }
  } catch (error) {
    if (error.code === '23505') {
      // Unique constraint violation - already earned
      return { success: false, reason: 'already_earned' }
    }
    throw error
  }
}

/**
 * Check if user is eligible for achievements and auto-award them
 */
export async function checkAndAwardAchievements(userId) {
  try {
    const rewards = await getUserRewards(userId)
    const achievements = await getUserAchievements(userId)
    const earnedSlugs = achievements.map((a) => a.achievements?.slug).filter(Boolean)

    const toAward = []

    // Check milestones
    if (rewards.total_ratings >= 10 && !earnedSlugs.includes('rate_10')) toAward.push('rate_10')
    if (rewards.total_ratings >= 50 && !earnedSlugs.includes('rate_50')) toAward.push('rate_50')
    if (rewards.total_ratings >= 100 && !earnedSlugs.includes('rate_100')) toAward.push('rate_100')
    if (rewards.total_ratings >= 500 && !earnedSlugs.includes('rate_500')) toAward.push('rate_500')

    if (rewards.current_streak >= 7 && !earnedSlugs.includes('streak_7')) toAward.push('streak_7')
    if (rewards.current_streak >= 30 && !earnedSlugs.includes('streak_30')) toAward.push('streak_30')

    // Award all eligible achievements
    const awarded = []
    for (const slug of toAward) {
      try {
        const result = await awardAchievement(userId, slug)
        if (result.success) awarded.push(result.achievement)
      } catch (e) {
        console.warn(`Failed to award ${slug}:`, e)
      }
    }

    return awarded
  } catch (error) {
    console.error('Error checking achievements:', error)
    return []
  }
}
