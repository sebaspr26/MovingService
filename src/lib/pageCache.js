import { useEffect } from 'react'
import { getActiveCompanyId } from './company'

// Last data of each section, per user and company, kept for the session: a
// section opens with it right away (no loading screen) and refreshes in the
// background. Every round trip to Supabase is ~0.4 s from Colombia, so
// waiting for a section's queries on every visit was most of the delay.
//
// Usage in a section:
//   const cached = readPageCache('profiles', session)
//   const [users, setUsers] = useState(cached?.users || [])
//   const [loading, setLoading] = useState(!cached)
//   usePageCacheSave('profiles', session, { users }, !loading)
//   ...and in its fetch: `if (!cached) setLoading(true)` (refresh silently)

const store = {}
const keyOf = (name, session, extra) => [name, session?.user?.id || '', getActiveCompanyId() || '', extra ?? ''].join('|')

export function readPageCache(name, session, extra) {
  return store[keyOf(name, session, extra)] || null
}

export function writePageCache(name, session, data, extra) {
  store[keyOf(name, session, extra)] = data
}

/** Saves `data` as the section's last data whenever it changes and `ready`. */
export function usePageCacheSave(name, session, data, ready, extra) {
  const key = keyOf(name, session, extra)
  const values = Object.values(data)
  useEffect(() => {
    if (ready) store[key] = data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, ...values])
}

// ── Auth users (api/invite-user list): ~0.5–0.7 s, more on a cold start,
// and asked by 7 sections. Once per session; Profiles refreshes it after
// changing users. ──
let authUsers = null

/** Raw Auth users, as api/invite-user returns them ({ users: [...] }). */
export function loadAuthUsers({ fresh = false } = {}) {
  if (fresh) authUsers = null
  authUsers ||= fetch('/api/invite-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })
    .then(async r => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error || `Error ${r.status}`)
      return data
    })
    .catch(err => { authUsers = null; throw err })
  return authUsers
}

export function invalidateAuthUsers() {
  authUsers = null
}
