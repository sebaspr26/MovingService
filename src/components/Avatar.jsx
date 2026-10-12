// Round profile picture (photo or initials) used for drivers, dispatchers and every user.
// The color tells the kind of user at a glance: drivers cyan, lease drivers green,
// dispatchers purple, admins blue, super admin orange, unions red, no account gray.
// Look: a tinted "glass" circle (soft gradient of the kind's color, colored initials, thin
// border) plus a small badge with an icon of the kind (truck, chat, shield, link; none for the super admin)
// so the kind is readable without color alone. It reacts to the mouse (see .avatar-i in
// index.css): lifts, grows and lights a ring in its color.
const KINDS = {
  driver: { color: '#06b6d4', icon: 'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12' },
  lease: { color: '#22c55e', icon: 'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12' },
  dispatcher: { color: '#a855f7', icon: 'M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z' },
  admin: { color: '#3b82f6', icon: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z' },
  super_admin: { color: '#f97316', icon: null }, // no badge: the super admin is recognised by his color alone
  union: { color: '#ef4444', icon: 'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244' },
  neutral: { color: '#94a3b8', icon: null },
  inactive: { color: '#6b7280', icon: null },
}

export const initialsOf = (name, fallback = '') => {
  const src = (name || fallback || '?').trim()
  return src.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

/** The kind for a user role (Auth role string). */
export const kindOfRole = role => (KINDS[role] ? role : role === 'driver_lease' ? 'lease' : role === 'driver' ? 'driver' : 'neutral')

// bg = the card's background (the badge gets a ring of that color so it looks cut out of the
// picture); flush = no outer breathing room, for when something is laid over the picture.
export default function Avatar({ name, fallback, src, kind = 'neutral', size = 40, bg = 'var(--color-gray-900)', flush = false, className = '', children }) {
  const c = KINDS[kind] || KINDS.neutral
  const badge = c.icon && size >= 36 ? Math.max(15, Math.round(size * 0.36)) : 0
  return (
    <span
      className={`avatar-i relative inline-flex shrink-0 select-none ${className}`}
      style={{
        '--av': c.color,
        width: size,
        height: size,
        margin: flush ? 0 : 1,
        transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), height 0.35s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <span
        className="avatar-i-face absolute inset-0 rounded-full overflow-hidden flex items-center justify-center"
        style={{ fontSize: Math.round(size * 0.38), transition: 'font-size 0.35s cubic-bezier(0.4,0,0.2,1)' }}
      >
        {children || initialsOf(name, fallback)}
        {src && <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      </span>
      {badge > 0 && (
        <span
          className="absolute flex items-center justify-center rounded-full"
          style={{ width: badge, height: badge, right: -badge * 0.12, bottom: -badge * 0.12, background: c.color, boxShadow: `0 0 0 2px ${bg}`, color: '#fff' }}
        >
          <svg style={{ width: badge * 0.62, height: badge * 0.62 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
          </svg>
        </span>
      )}
    </span>
  )
}
