import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Nav } from './components/Nav'
import { useFlag } from './hooks/useFlags'

export default function OpenLeaderboardPage() {
  const enabled = useFlag('open-leaderboard')
  const navigate = useNavigate()

  useEffect(() => {
    if (!enabled) navigate('/', { replace: true })
  }, [enabled, navigate])

  if (!enabled) return null

  return (
    <div className="app">
      <Nav />
      <main style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted, #888)' }}>
        <h2>Coming soon</h2>
        <p>Theme to be determined.</p>
      </main>
    </div>
  )
}
