// Round profile picture (photo or initials) used for drivers, dispatchers and every user.
// The color tells the kind of user at a glance: drivers cyan, lease drivers green,
// dispatchers purple, admins blue, super admin orange, unions orange-red, no account gray.
// Saturated gradient + gloss + a ring in the kind's color (with a gap that follows the card
// background) + a soft glow, so it stands out on every theme.
const KINDS = {
  driver: { from: '#06b6d4', to: '#0e7490', ring: '#22d3ee', glow: 'rgba(6,182,212,0.45)' },
  lease: { from: '#22c55e', to: '#15803d', ring: '#4ade80', glow: 'rgba(34,197,94,0.45)' },
  dispatcher: { from: '#a855f7', to: '#6d28d9', ring: '#c084fc', glow: 'rgba(168,85,247,0.45)' },
  admin: { from: '#3b82f6', to: '#1d4ed8', ring: '#60a5fa', glow: 'rgba(59,130,246,0.45)' },
  super_admin: { from: '#fb923c', to: '#c2410c', ring: '#fdba74', glow: 'rgba(249,115,22,0.5)' },
  union: { from: '#f97316', to: '#b91c1c', ring: '#fb923c', glow: 'rgba(249,115,22,0.5)' },
  neutral: { from: '#94a3b8', to: '#475569', ring: '#94a3b8', glow: 'rgba(100,116,139,0.35)' },
  inactive: { from: '#6b7280', to: '#374151', ring: '#6b7280', glow: 'transparent' },
}

export const initialsOf = (name, fallback = '') => {
  const src = (name || fallback || '?').trim()
  return src.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

/** The kind for a user role (Auth role string). */
export const kindOfRole = role => (KINDS[role] ? role : role === 'driver_lease' ? 'lease' : role === 'driver' ? 'driver' : 'neutral')

// flush: no outer margin (the ring then overflows the box; use when something is laid over the picture)
export default function Avatar({ name, fallback, src, kind = 'neutral', size = 40, bg = 'var(--color-gray-900)', flush = false, className = '', children }) {
  const c = KINDS[kind] || KINDS.neutral
  const ringGap = size >= 40 ? 2 : 1.5
  const ringW = size >= 40 ? 2 : 1.5
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        fontWeight: 800,
        letterSpacing: '0.02em',
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.35)',
        background: `radial-gradient(circle at 30% 22%, rgba(255,255,255,0.32), rgba(255,255,255,0) 55%), linear-gradient(145deg, ${c.from}, ${c.to})`,
        boxShadow: `0 0 0 ${ringGap}px ${bg}, 0 0 0 ${ringGap + ringW}px ${c.ring}, 0 6px 16px -4px ${c.glow}`,
        margin: flush ? 0 : ringGap + ringW,
        transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), height 0.35s cubic-bezier(0.4,0,0.2,1), font-size 0.35s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {children || initialsOf(name, fallback)}
      {src && <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />}
    </span>
  )
}
