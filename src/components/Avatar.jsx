// Round profile picture (photo or initials) used for drivers, dispatchers and every user.
// The color tells the kind of user at a glance: drivers cyan, lease drivers green,
// dispatchers purple, admins blue, super admin orange, unions orange-red, no account gray.
// Flat on purpose: one solid color, white initials, no gradient / gloss / ring / glow. A photo
// gets a plain border in the same color.
const KINDS = {
  driver: { color: '#0891b2' },
  lease: { color: '#16a34a' },
  dispatcher: { color: '#9333ea' },
  admin: { color: '#2563eb' },
  super_admin: { color: '#ea580c' },
  union: { color: '#dc2626' },
  neutral: { color: '#64748b' },
  inactive: { color: '#4b5563' },
}

export const initialsOf = (name, fallback = '') => {
  const src = (name || fallback || '?').trim()
  return src.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

/** The kind for a user role (Auth role string). */
export const kindOfRole = role => (KINDS[role] ? role : role === 'driver_lease' ? 'lease' : role === 'driver' ? 'driver' : 'neutral')

// bg and flush are kept so existing callers keep working; the flat look needs neither
export default function Avatar({ name, fallback, src, kind = 'neutral', size = 40, className = '', children }) {
  const c = KINDS[kind] || KINDS.neutral
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: '#fff',
        background: c.color,
        transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), height 0.35s cubic-bezier(0.4,0,0.2,1), font-size 0.35s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {children || initialsOf(name, fallback)}
      {src && <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ border: `2px solid ${c.color}`, borderRadius: '50%' }} />}
    </span>
  )
}
