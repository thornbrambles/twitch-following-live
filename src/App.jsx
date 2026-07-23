import { useCallback, useEffect, useState } from 'react'
import {
  clearStoredToken,
  consumeAuthErrorFromLocation,
  consumeTokenFromLocation,
  getFollowedChannels,
  getLiveStreams,
  getStoredClientId,
  getStoredToken,
  login,
  logout,
  setStoredClientId,
  validateToken,
} from './twitch'
import './App.css'

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

function StreamCard({ channel, stream }) {
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
          <div className="thumbnail thumbnail-offline" />
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

export default function App() {
  const [clientId, setClientId] = useState(getStoredClientId())
  const [user, setUser] = useState(null)
  const [channels, setChannels] = useState([])
  const [streamsByUserId, setStreamsByUserId] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadFollowedAndLive = useCallback(async (userId, token, cid) => {
    setLoading(true)
    setError(null)
    try {
      const followed = await getFollowedChannels(userId, token, cid)
      setChannels(followed)
      if (followed.length) {
        const streams = await getLiveStreams(
          followed.map((c) => c.broadcaster_id),
          token,
          cid,
        )
        setStreamsByUserId(Object.fromEntries(streams.map((s) => [s.user_id, s])))
      } else {
        setStreamsByUserId({})
      }
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

  const handleRefresh = () => {
    const token = getStoredToken()
    if (user && token) loadFollowedAndLive(user.user_id, token, clientId)
  }

  const handleLogout = async () => {
    await logout(clientId)
    setUser(null)
    setChannels([])
    setStreamsByUserId({})
  }

  const handleSaveClientId = (id) => {
    setStoredClientId(id)
    setClientId(id)
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

  const live = channels.filter((c) => streamsByUserId[c.broadcaster_id])
  const offline = channels.filter((c) => !streamsByUserId[c.broadcaster_id])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Twitch Following Live</h1>
        <div className="header-actions">
          <span className="logged-in-as">{user.login}</span>
          <button onClick={handleRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {loading && !channels.length && <p>Loading your followed channels…</p>}

      {!loading && !channels.length && !error && <p>You aren't following anyone yet.</p>}

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
              <StreamCard key={c.broadcaster_id} channel={c} stream={null} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
