/**
 * InveXt mark. The X is built from an ascending bar crossing a descending one —
 * a chart cross, not a letterform borrowed from a template.
 */
export default function Brand({ size = 26, withWord = true }: { size?: number; withWord?: boolean }) {
  return (
    <span className="brand" style={{ gap: size * 0.34 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="brand__m">
        <rect width="32" height="32" rx="8" fill="#0F0F14" />
        <path d="M7 24 L16 15 L25 8" stroke="#E8A33D" strokeWidth="3.4" strokeLinecap="square" fill="none" />
        <path d="M7 8 L25 24" stroke="#F0EEE9" strokeWidth="3.4" strokeLinecap="square" fill="none" opacity="0.9" />
        <circle cx="25" cy="8" r="3" fill="#E8A33D" />
      </svg>
      {withWord && (
        <span className="brand__w" style={{ fontSize: size * 0.66 }}>
          Inve<span>X</span>t
        </span>
      )}
    </span>
  );
}
