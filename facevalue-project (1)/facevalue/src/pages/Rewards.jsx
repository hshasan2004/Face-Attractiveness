import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../supabase/client'
import {
  getUserRewards,
  getUserAchievements,
  getLeaderboard,
  getRewardTiers,
  getUserTransactions,
  checkAndAwardAchievements,
} from '../utils/rewards'

export default function Rewards() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [rewards, setRewards] = useState(null)
  const [achievements, setAchievements] = useState([])
  const [allAchievements, setAllAchievements] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [tiers, setTiers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    loadRewardsData()
  }, [user, navigate])

  async function getAllAchievements() {
    try {
      const { data, error } = await supabase
        .from('achievements')
        .select('*')
        .order('id')
      if (error) throw error
      return data || []
    } catch (e) {
      console.error('Error fetching achievements:', e)
      return []
    }
  }

  async function loadRewardsData() {
    try {
      setLoading(true)

      // Load all data in parallel
      const [rewardsData, achievementsData, allAchievementsData, leaderboardData, tiersData, transactionsData] =
        await Promise.all([
          getUserRewards(user.id),
          getUserAchievements(user.id),
          getAllAchievements(),
          getLeaderboard(10),
          getRewardTiers(),
          getUserTransactions(user.id, 5),
        ])

      setRewards(rewardsData)
      setAchievements(achievementsData)
      setAllAchievements(allAchievementsData)
      setLeaderboard(leaderboardData)
      setTiers(tiersData)
      setTransactions(transactionsData)

      // Check for newly earned achievements
      const newAchievements = await checkAndAwardAchievements(user.id)
      if (newAchievements.length > 0) {
        // Reload achievements if new ones were awarded
        const updated = await getUserAchievements(user.id)
        setAchievements(updated)
      }
    } catch (error) {
      console.error('Error loading rewards:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="page" style={{ textAlign: 'center', padding: '40px' }}>Loading your rewards...</div>
  }

  if (!rewards) {
    return <div className="page" style={{ padding: '40px' }}>No rewards data found. Start rating to earn points!</div>
  }

  const currentTier = tiers.find((t) => t.name === rewards.current_tier)
  const nextTier = tiers.find((t) => t.min_points > rewards.total_points)
  const pointsToNextTier = nextTier ? nextTier.min_points - rewards.total_points : 0
  const progressPercent = currentTier ? ((rewards.total_points - currentTier.min_points) / (nextTier?.min_points - currentTier?.min_points || 100)) * 100 : 0

  const earnedAchievementIds = new Set(achievements.map((a) => a.achievement_id))

  const getTierBadge = (tierName) => {
    switch (tierName) {
      case 'Platinum': return '👑'
      case 'Gold': return '⭐'
      case 'Silver': return '🥈'
      default: return '🥉'
    }
  }

  return (
    <div className="page">
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '2rem' }}>🏆 Rewards & Achievements</h1>
          <p style={{ color: 'var(--muted)' }}>Earn points and unlock badges by rating photos</p>
        </div>
      </div>

      {/* Header card - tier and points */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', marginBottom: '24px' }}>
        <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '20px' }}>Current Tier</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '4px' }}>{rewards.total_points}</div>
            <div style={{ opacity: 0.9 }}>Total Points</div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{getTierBadge(rewards.current_tier)}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{rewards.current_tier}</div>
          </div>
        </div>

        {nextTier && (
          <div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '8px' }}>
              {pointsToNextTier} points until {nextTier.name}
            </div>
            <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.3)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'white', borderRadius: '6px', width: `${Math.min(progressPercent, 100)}%`, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* Stats cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div className="card">
          <div style={{ color: 'var(--muted)', marginBottom: '12px' }}>Ratings Submitted</div>
          <div style={{ fontSize: '2.4rem', fontWeight: 700 }}>{rewards.total_ratings}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '8px' }}>
            {rewards.total_ratings > 0 ? `+${rewards.total_ratings * 10} points earned` : 'Start rating to earn points'}
          </div>
        </div>

        <div className="card">
          <div style={{ color: 'var(--muted)', marginBottom: '12px' }}>Surveys Completed</div>
          <div style={{ fontSize: '2.4rem', fontWeight: 700 }}>{rewards.total_surveys_completed}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '8px' }}>
            {rewards.total_surveys_completed > 0 ? `+${rewards.total_surveys_completed * 100} bonus points` : 'Complete surveys for bonuses'}
          </div>
        </div>

        <div className="card">
          <div style={{ color: 'var(--muted)', marginBottom: '12px' }}>Current Streak</div>
          <div style={{ fontSize: '2.4rem', fontWeight: 700 }}>
            {rewards.current_streak}
            <span style={{ fontSize: '1.2rem' }}> 🔥</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '8px' }}>
            Best streak: {rewards.best_streak} days
          </div>
        </div>

        <div className="card">
          <div style={{ color: 'var(--muted)', marginBottom: '12px' }}>Achievements</div>
          <div style={{ fontSize: '2.4rem', fontWeight: 700 }}>{achievements.length}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '8px' }}>
            of {allAchievements.length} unlocked
          </div>
        </div>
      </div>

      {/* Achievements section */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>🎯 Achievements</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {allAchievements.map((achievement) => {
            const earned = earnedAchievementIds.has(achievement.id)
            return (
              <div
                key={achievement.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '12px',
                  background: earned ? 'rgba(102, 126, 234, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  border: earned ? '2px solid #667eea' : '2px solid transparent',
                  borderRadius: '8px',
                  textAlign: 'center',
                  opacity: earned ? 1 : 0.5,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title={achievement.description}
              >
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>{achievement.icon || '🏅'}</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.2 }}>{achievement.title}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '2px' }}>+{achievement.points_reward}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Activity and Leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div className="card">
          <h3 style={{ marginBottom: '16px' }}>📊 Recent Activity</h3>
          {transactions.length > 0 ? (
            <div style={{ marginTop: '12px' }}>
              {transactions.map((tx) => (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <div>{tx.description}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase' }}>{tx.transaction_type}</div>
                  </div>
                  <div style={{ fontWeight: 600, color: '#667eea' }}>+{tx.points}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No transactions yet. Start rating to see activity!</div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '16px' }}>🏅 Top 10 Evaluators</h3>
          {leaderboard.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border-color)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--muted)' }}>Rank</th>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border-color)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--muted)' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border-color)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--muted)' }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, idx) => (
                  <tr key={entry.user_id}>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>{entry.user_profiles?.full_name || 'Anonymous'}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>{entry.total_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Leaderboard will appear once users start rating</div>
          )}
        </div>
      </div>
    </div>
  )
}
