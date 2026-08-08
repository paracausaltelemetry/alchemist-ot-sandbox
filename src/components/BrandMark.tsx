/**
 * The Paracausal Telemetry radar brand-mark, mirrored from the main site: concentric rings, a
 * crosshair, a core dot, a pulsing blip and a sweep (trails + beam) that spins on hover. Decorative,
 * so it is hidden from assistive tech. Themed and centred via the `.brand-mark` / `.brand-radar-*`
 * styles.
 */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <circle cx="24" cy="24" r="19" className="brand-radar-ring" />
        <circle cx="24" cy="24" r="11.5" className="brand-radar-ring brand-radar-ring-inner" />
        <path d="M24 5V43M5 24H43" className="brand-radar-grid" />
        <g className="brand-radar-sweep">
          <rect className="brand-radar-trail" x="33" y="12" width="3" height="3" opacity="0.7" />
          <rect className="brand-radar-trail" x="30" y="15" width="3" height="3" opacity="0.65" />
          <rect className="brand-radar-trail" x="33" y="15" width="3" height="3" opacity="0.55" />
          <rect className="brand-radar-trail" x="36" y="15" width="3" height="3" opacity="0.45" />
          <rect className="brand-radar-trail" x="30" y="18" width="3" height="3" opacity="0.35" />
          <rect className="brand-radar-trail" x="33" y="18" width="3" height="3" opacity="0.4" />
          <path className="brand-radar-beam" d="M24 24L36.2 9.4" />
        </g>
        <circle cx="24" cy="24" r="2.6" className="brand-radar-core" />
        <circle cx="39" cy="20.5" r="2.8" className="brand-radar-blip" />
      </svg>
    </span>
  );
}
