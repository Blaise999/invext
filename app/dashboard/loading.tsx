/** Instant feedback on route change — the tabs feel slow without it. */
export default function Loading() {
  return (
    <div className="skel">
      <div className="skel__bar" style={{ width: "38%", height: 30 }} />
      <div className="skel__bar" style={{ width: "62%", height: 56 }} />
      <div className="skel__bar" style={{ height: 190 }} />
      <div className="skel__row">
        <div className="skel__bar" style={{ height: 64 }} />
        <div className="skel__bar" style={{ height: 64 }} />
      </div>
    </div>
  );
}
