const AUTH_URL = 'https://id.twitch.tv/oauth2/authorize'
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate'
const REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke'
const HELIX_URL = 'https://api.twitch.tv/helix'

const SCOPES = ['user:read:follows']

const TOKEN_KEY = 'twitch_access_token'
const CLIENT_ID_KEY = 'twitch_client_id'

export function getStoredClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) || import.meta.env.VITE_TWITCH_CLIENT_ID || ''
}

export function setStoredClientId(clientId) {
  localStorage.setItem(CLIENT_ID_KEY, clientId)
}

export function getRedirectUri() {
  return window.location.origin + import.meta.env.BASE_URL
}

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

function setStoredToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

export function login(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
  })
  window.location.href = `${AUTH_URL}?${params.toString()}`
}

export async function logout(clientId) {
  const token = getStoredToken()
  clearStoredToken()
  if (token && clientId) {
    try {
      await fetch(`${REVOKE_URL}?client_id=${clientId}&token=${token}`, { method: 'POST' })
    } catch {
      // best-effort; token is cleared locally regardless
    }
  }
}

// Twitch returns the token in the URL fragment after redirecting back, e.g.
// #access_token=...&scope=...&token_type=bearer
export function consumeTokenFromLocation() {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token')) return null

  const params = new URLSearchParams(hash.slice(1))
  const token = params.get('access_token')

  // Strip the hash so the token doesn't linger in the URL/history.
  window.history.replaceState(null, '', window.location.pathname + window.location.search)

  if (token) {
    setStoredToken(token)
    return token
  }
  return null
}

export function consumeAuthErrorFromLocation() {
  const hash = window.location.hash
  if (!hash || !hash.includes('error')) return null
  const params = new URLSearchParams(hash.slice(1))
  const description = params.get('error_description')
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return description ? description.replace(/\+/g, ' ') : 'Twitch login failed'
}

export async function validateToken(token) {
  const res = await fetch(VALIDATE_URL, {
    headers: { Authorization: `OAuth ${token}` },
  })
  if (!res.ok) return null
  return res.json() // { client_id, login, user_id, scopes, expires_in }
}

async function helixGet(path, { token, clientId, params }) {
  const url = new URL(`${HELIX_URL}${path}`)
  for (const [key, value] of Object.entries(params || {})) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v))
    } else if (value !== undefined && value !== null) {
      url.searchParams.set(key, value)
    }
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': clientId,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Twitch API ${path} failed: ${res.status} ${body}`)
  }
  return res.json()
}

export async function getFollowedChannels(userId, token, clientId) {
  const channels = []
  let cursor

  do {
    const data = await helixGet('/channels/followed', {
      token,
      clientId,
      params: { user_id: userId, first: 100, after: cursor },
    })
    channels.push(...data.data)
    cursor = data.pagination?.cursor
  } while (cursor)

  return channels
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function getLiveStreams(userIds, token, clientId) {
  const streams = []
  for (const batch of chunk(userIds, 100)) {
    const data = await helixGet('/streams', {
      token,
      clientId,
      params: { user_id: batch, first: 100 },
    })
    streams.push(...data.data)
  }
  return streams
}

export async function getUsers(userIds, token, clientId) {
  const users = []
  for (const batch of chunk(userIds, 100)) {
    const data = await helixGet('/users', {
      token,
      clientId,
      params: { id: batch },
    })
    users.push(...data.data)
  }
  return users
}
