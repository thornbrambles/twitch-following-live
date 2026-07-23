import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearStoredToken,
  consumeAuthErrorFromLocation,
  consumeTokenFromLocation,
  getFollowedChannels,
  getLiveStreams,
  getStoredClientId,
  getStoredToken,
  getUsers,
  login,
  logout,
  setStoredClientId,
  validateToken,
} from './twitch'
import './App.css'

const REFRESH_INTERVAL_MS = 60_000
const NOTIFICATIONS_ENABLED_KEY = 'twitch_notifications_enabled'

function ClientIdForm({ onSave }) {
  const [value, setValue] = useState('')

  return (
    <div className="card">
      <h2>Set up your Twitch Client ID</h2>
      <p>
        This app needs a Twitch application Client ID to sign you in. Register one for free at{' '}
        <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">
          dev.twitch.tv/console/apps
        </a>{' '}
        with the OAuth Redirect URL set to <code>{window.location.origin + import.meta.env.BASE_URL}</code>,
        then paste the Client ID below.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) onSave(value.trim())
        }}
      >
        <input
          type="text"
          placeholder="Twitch Client ID"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit">Save</button>
      </form>
    </div>
  )
}

function StreamCard({ channel, stream, avatarUrl }) {
  const thumbnail = stream
    ? stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
    : null

  return (
    <a
      className={`channel-card${stream ? ' live' : ''}`}
      href={`https://twitch.tv/${channel.broadcaster_login}`}
      target="_blank"
      rel="noreferrer"
    >
      <div className="thumbnail-wrap">
        {stream ? (
          <img className="thumbnail" src={thumbnail} alt={stream.title} loading="lazy" />
        ) : (
          <div className="thumbnail thumbnail-offline">
            {avatarUrl && <img className="offline-avatar" src={avatarUrl} alt="" loading="lazy" />}
          </div>
        )}
        {stream && <span className="live-badge">LIVE</span>}
      </div>
      <div className="channel-info">
        <span className="channel-name">{channel.broadcaster_name}</span>
        {stream ? (
          <>
            <span className="stream-title">{stream.title}</span>
            <span className="stream-meta">
              {stream.game_name} · {stream.viewer_count.toLocaleString()} viewers
            </span>
          </>
        ) : (
          <span className="offline-label">Offline</span>
        )}
      </div>
    </a>
  )
}

function SkeletonCard() {
  return (
    <div className="channel-card skeleton">
      <div className="thumbnail skeleton-block" />
      <div className="channel-info">
        <span className="skeleton-line skeleton-line-title" />
        <span className="skeleton-line skeleton-line-sub" />
      </div>
    </div>
  )
}

export default function App() {
  const [clientId, setClientId] = useState(getStoredClientId())
  const [user, setUser] = useState(null)
  const [channels, setChannels] = useState([])
  const [streamsByUserId, setStreamsByUserId] = useState({})
  const [avatarsByUserId, setAvatarsByUserId] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [search, setSearch] = useState('')
  const [gameFilter, setGameFilter] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === 'true',
  )

  const previousLiveIdsRef = useRef(null)
  const notificationsEnabledRef = useRef(notificationsEnabled)
  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled
  }, [notificationsEnabled])

  const loadFollowedAndLive = useCallback(async (userId, token, cid) => {
    setLoading(true)
    setError(null)
    try {
      const followed = await getFollowedChannels(userId, token, cid)
      setChannels(followed)
      if (followed.length) {
        const broadcasterIds = followed.map((c) => c.broadcaster_id)
        const [streams, users] = await Promise.all([
          getLiveStreams(broadcasterIds, token, cid),
          getUsers(broadcasterIds, token, cid),
        ])
        setStreamsByUserId(Object.fromEntries(streams.map((s) => [s.user_id, s])))
        const avatarMap = Object.fromEntries(users.map((u) => [u.id, u.profile_image_url]))
        setAvatarsByUserId(avatarMap)

        if (notificationsEnabledRef.current && previousLiveIdsRef.current) {
          const newlyLive = streams.filter((s) => !previousLiveIdsRef.current.has(s.user_id))
          for (const s of newlyLive) {
            const notif = new Notification(`${s.user_name} just went live`, {
              body: s.title,
              icon: avatarMap[s.user_id],
            })
            notif.onclick = () => {
              window.open(`https://twitch.tv/${s.user_login}`, '_blank')
            }
          }
        }
        previousLiveIdsRef.current = new Set(streams.map((s) => s.user_id))
      } else {
        setStreamsByUserId({})
        setAvatarsByUserId({})
        previousLiveIdsRef.current = new Set()
      }
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const authError = consumeAuthErrorFromLocation()
    if (authError) setError(authError)

    const token = consumeTokenFromLocation() || getStoredToken()
    if (!token || !clientId) return

    let cancelled = false
    ;(async () => {
      const info = await validateToken(token)
      if (cancelled) return
      if (!info) {
        clearStoredToken()
        setError('Your Twitch session expired. Please log in again.')
        return
      }
      setUser(info)
      await loadFollowedAndLive(info.user_id, token, clientId)
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    if (!user) return undefined

    const id = setInterval(() => {
      const token = getStoredToken()
      if (token) loadFollowedAndLive(user.user_id, token, clientId)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(id)
  }, [user, clientId, loadFollowedAndLive])

  const handleRefresh = () => {
    const token = getStoredToken()
    if (user && token) loadFollowedAndLive(user.user_id, token, clientId)
  }

  const handleLogout = async () => {
    await logout(clientId)
    setUser(null)
    setChannels([])
    setStreamsByUserId({})
    setLastUpdated(null)
    previousLiveIdsRef.current = null
  }

  const handleSaveClientId = (id) => {
    setStoredClientId(id)
    setClientId(id)
  }

  const handleToggleNotifications = async () => {
    if (!('Notification' in window)) {
      setError('Notifications are not supported in this browser.')
      return
    }
    if (notificationsEnabled) {
      setNotificationsEnabled(false)
      localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'false')
      return
    }
    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }
    if (permission === 'granted') {
      setNotificationsEnabled(true)
      localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'true')
    } else {
      setError('Notification permission was denied. Enable it in your browser’s site settings to use this.')
    }
  }

  if (!clientId) {
    return (
      <div className="app">
        <ClientIdForm onSave={handleSaveClientId} />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app">
        <div className="card">
          <h1>Twitch Following Live</h1>
          <p>See which of your followed streamers are live right now.</p>
          {error && <p className="error">{error}</p>}
          <button className="login-button" onClick={() => login(clientId)}>
            Log in with Twitch
          </button>
        </div>
      </div>
    )
  }

  const query = search.trim().toLowerCase()
  const matchesSearch = (c) => !query || c.broadcaster_name.toLowerCase().includes(query)

  const liveAll = channels.filter((c) => streamsByUserId[c.broadcaster_id])
  const gameOptions = [...new Set(liveAll.map((c) => streamsByUserId[c.broadcaster_id].game_name).filter(Boolean))].sort()

  const live = liveAll
    .filter(matchesSearch)
    .filter((c) => !gameFilter || streamsByUserId[c.broadcaster_id].game_name === gameFilter)
    .sort((a, b) => streamsByUserId[b.broadcaster_id].viewer_count - streamsByUserId[a.broadcaster_id].viewer_count)
  const offline = channels.filter((c) => !streamsByUserId[c.broadcaster_id]).filter(matchesSearch)

  const showSkeletons = loading && !channels.length

  return (
    <div className="app">
      <header className="app-header">
        <h1>Twitch Following Live</h1>
        <div className="header-actions">
          <span className="logged-in-as">{user.login}</span>
          <button onClick={handleToggleNotifications}>
            {notificationsEnabled ? '🔔 Notifications on' : '🔕 Enable notifications'}
          </button>
          <button onClick={handleRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {channels.length > 0 && (
        <div className="toolbar">
          <input
            type="text"
            className="search-input"
            placeholder="Search channels…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {gameOptions.length > 0 && (
            <select value={gameFilter} onChange={(e) => setGameFilter(e.target.value)}>
              <option value="">All categories</option>
              {gameOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
          {lastUpdated && (
            <span className="last-updated">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>
      )}

      {showSkeletons && (
        <section>
          <h2>Loading your followed channels…</h2>
          <div className="channel-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </section>
      )}

      {!loading && !channels.length && !error && <p>You aren't following anyone yet.</p>}

      {!showSkeletons && channels.length > 0 && live.length === 0 && offline.length === 0 && (
        <p>No channels match your filters.</p>
      )}

      {live.length > 0 && (
        <section>
          <h2>Live now ({live.length})</h2>
          <div className="channel-grid">
            {live.map((c) => (
              <StreamCard key={c.broadcaster_id} channel={c} stream={streamsByUserId[c.broadcaster_id]} />
            ))}
          </div>
        </section>
      )}

      {offline.length > 0 && (
        <section>
          <h2>Offline ({offline.length})</h2>
          <div className="channel-grid">
            {offline.map((c) => (
              <StreamCard
                key={c.broadcaster_id}
                channel={c}
                stream={null}
                avatarUrl={avatarsByUserId[c.broadcaster_id]}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
