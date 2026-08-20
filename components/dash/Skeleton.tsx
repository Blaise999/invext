/**
 * Route-level skeletons.
 *
 * These exist so navigation never shows an empty pane. Next streams this in
 * the moment a tab is tapped, while the server work is still happening — so
 * the frame that appears has the right *shape*, and the content fills in.
 * The measurable win is perceived latency: a correctly-shaped placeholder
 * reads as "loading", a blank one reads as "broken".
 *
 * Kept boring on purpose — no shimmer sweep. A moving highlight draws the eye
 * to the placeholder rather than to the content that replaces it.
 */
export function Bar({ w = "100%", h = 14 }: { w?: string; h?: number }) {
  return <span className="sk" style={{ width: w, height: h }} aria-hidden="true" />;
}

export function SkeletonPage({ rows = 5, chart = false }: { rows?: number; chart?: boolean }) {
  return (
    <div className="skwrap" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="sk__head">
        <Bar w="180px" h={26} />
        <Bar w="90px" h={12} />
      </div>
      {chart && <Bar w="100%" h={220} />}
      <div className="sk__rows">
        {Array.from({ length: rows }).map((_, i) => (
          <div className="sk__row" key={i}>
            <Bar w="44px" h={44} />
            <Bar w={`${40 + ((i * 13) % 35)}%`} h={16} />
            <Bar w="72px" h={16} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default SkeletonPage;
