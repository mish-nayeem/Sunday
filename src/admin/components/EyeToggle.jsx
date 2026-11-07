// The 👁 beside a product or collection in the admin: open = shoppers see
// it, shut = hidden from the shop (still here, still editable).
export default function EyeToggle({ hidden, busy = false, label = '', onToggle, className = '' }) {
  const what = label ? ` ${label}` : ''
  return (
    <button
      type="button"
      className={`eye-toggle ${hidden ? 'shut' : 'open'} ${className}`}
      aria-pressed={hidden}
      aria-label={hidden ? `Hidden — show${what} in the shop` : `Showing — hide${what} from the shop`}
      title={hidden ? 'Hidden from the shop — tap to show' : 'Showing in the shop — tap to hide'}
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {hidden ? (
          <>
            <path d="M3 12c2.2-3.6 5.3-5.5 9-5.5s6.8 1.9 9 5.5c-2.2 3.6-5.3 5.5-9 5.5S5.2 15.6 3 12Z" opacity="0.35" />
            <path d="M4 4l16 16" />
          </>
        ) : (
          <>
            <path d="M3 12c2.2-3.6 5.3-5.5 9-5.5s6.8 1.9 9 5.5c-2.2 3.6-5.3 5.5-9 5.5S5.2 15.6 3 12Z" />
            <circle cx="12" cy="12" r="2.6" />
          </>
        )}
      </svg>
    </button>
  )
}
