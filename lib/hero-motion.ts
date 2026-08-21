/**
 * HERO MOTION MODEL
 *
 * The old hero cross-dissolved three text panels over a canvas that did a slow
 * constant zoom. It read as a slideshow with a Ken Burns effect bolted on: the
 * camera never acknowledged that the copy had changed, so the two halves of the
 * hero were moving to different clocks.
 *
 * This model puts them on one clock. Scroll drives a single progress value and
 * everything — frame index, crop anchor, focal blur, type reveal, the transport
 * readout — is derived from it here, so the canvas and the copy are choreographed
 * against each other rather than merely co-located.
 *
 * Three ideas do the work:
 *
 *   TRAVEL. Each plate has its own crop anchor and its own page layout. The
 *   camera pushes in and drifts left across plate two, then pulls back and
 *   recentres for plate three. The composition changes, not just the words.
 *
 *   HEAT. A hand-off between plates is a discrete event, so it gets a discrete
 *   treatment. `heatAt` peaks at each boundary and decays either side; the
 *   aperture blades, the focal blur and the cut rule all read off it. Between
 *   boundaries heat is zero and the hero is perfectly still apart from travel.
 *
 *   WIPE. Type does not fade. Lines open from the bottom edge on a stagger and
 *   are eaten from the bottom edge on the way out, so a headline reads as a
 *   strip of film passing a gate rather than as an element with an opacity.
 *
 * All of it is pure and synchronous — no state, no refs — so the canvas loop can
 * call it every frame and React can call it during render without the two
 * disagreeing about where in the timeline we are.
 */

export const PLATES = 3;
export const SEG = 1 / PLATES;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smoothstep. Cheap, C1-continuous, and the only easing this file needs. */
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Position inside plate `i`'s band. Negative before it, above 1 after it. */
export const localOf = (p: number, i: number) => (p - i * SEG) / SEG;

/** Which plate owns this progress value. */
export const plateOf = (p: number) =>
  Math.min(PLATES - 1, Math.max(0, Math.floor(p / SEG)));

/* ------------------------------------------------------------------ heat -- */

/**
 * 0 while a plate is settled, 1 at the instant of a hand-off.
 *
 * `width` is in progress units either side of the boundary. Narrow on purpose:
 * a long transition turns the whole hero into a permanent smear, and the point
 * of the blades is that they are an event you notice, not an atmosphere.
 */
export function heatAt(p: number, width = 0.052): number {
  let hottest = 0;
  for (let i = 1; i < PLATES; i++) {
    const d = Math.abs(p - i * SEG) / width;
    if (d < 1) hottest = Math.max(hottest, 1 - smooth(d));
  }
  return hottest;
}

/* ---------------------------------------------------------------- travel -- */

export interface Crop {
  /** Horizontal anchor of the crop, 0 = left edge of frame, 1 = right. */
  x: number;
  /** Vertical anchor. Biased above centre so subjects clear the copy block. */
  y: number;
  zoom: number;
}

/**
 * One anchor per plate. These are framing decisions, not tuning constants:
 *
 *   01 — subject sits right of centre, wide, because the copy owns the left.
 *   02 — push in and drift left; the readout column takes the right side.
 *   03 — pull back to the widest framing on the page, recentred, because the
 *        last plate is about the whole group rather than one part of it.
 */
const ANCHORS: Crop[] = [
  { x: 0.63, y: 0.44, zoom: 1.15 },
  { x: 0.33, y: 0.52, zoom: 1.3 },
  { x: 0.5, y: 0.41, zoom: 1.01 },
];

export function cropAt(p: number, narrow = false): Crop {
  const t = clamp01(p) * (PLATES - 1);
  const i = Math.min(PLATES - 2, Math.floor(t));
  const f = smooth(t - i);
  const a = ANCHORS[i];
  const b = ANCHORS[i + 1];

  // A shallow, slow breath on top of the travel. The sequence is sampled down
  // to ~140 stills, so several scroll positions resolve to the same frame; this
  // guarantees the image is never dead still at any scroll position, and it is
  // small enough to read as a hand on a camera rather than as a wobble.
  const breath = Math.sin(p * Math.PI * 2.4) * 0.007;

  const zoom = lerp(a.zoom, b.zoom, f) + breath;

  /**
   * A portrait master is already close to a phone's aspect ratio, so the
   * desktop anchors — which assume a wide frame with room to travel across —
   * throw most of the subject off screen. On a narrow viewport the travel is
   * pulled most of the way back toward centre and the push-in is damped.
   */
  if (narrow) {
    return {
      x: lerp(0.5, lerp(a.x, b.x, f), 0.34),
      y: lerp(0.42, lerp(a.y, b.y, f), 0.34),
      zoom: 1 + (zoom - 1) * 0.4,
    };
  }

  return {
    x: lerp(a.x, b.x, f),
    y: lerp(a.y, b.y, f),
    zoom,
  };
}

/* ------------------------------------------------------------------ type -- */

export interface Envelope {
  /** 0 → 1 as the plate opens. */
  enter: number;
  /** 1 → 0 as the plate is eaten. */
  exit: number;
  /** Composite visibility, for pointer-events and aria gating. */
  presence: number;
}

/**
 * Enter and exit are tracked separately rather than collapsed into one opacity,
 * because the wipe needs both edges independently: a line opens from its bottom
 * edge and is later consumed from the same edge, and a single scalar can't
 * express "fully open" and "half eaten" at once.
 *
 * The first plate never ramps in and the last never ramps out — plate one has
 * to be legible the instant the page paints, and plate three has to still be
 * there when the pin releases into the ticker.
 */
export function envelopeAt(local: number, first: boolean, last: boolean): Envelope {
  /**
   * The last plate reveals slowly, across most of its band, and that is the
   * whole fix for the dead stretch under the hero.
   *
   * With a 0.34 rise every plate finished a quarter of the way into its own
   * band — plate three had said everything it was going to say by p = 0.75,
   * leaving the final quarter of the pin as scroll that changed nothing. That
   * reads as empty space even though the stage is still full-bleed. A 0.86
   * rise lands plate three at p = 0.92, so the copy finishes just before the
   * pin releases rather than long before it.
   */
  const rise = last ? 0.86 : 0.34;
  const enter = first ? 1 : smooth((local + 0.1) / rise);
  const exit = last ? 1 : smooth((1.12 - local) / 0.34);
  return { enter, exit, presence: Math.min(enter, exit) };
}

/**
 * Per-line stagger. Line 0 leads, each subsequent line trails it by `step` of
 * the envelope, so a three-line headline unrolls instead of appearing at once.
 */
export const stagger = (e: number, line: number, step = 0.16) =>
  clamp01((e - line * step) / (1 - step));

/**
 * The clip-path for a wiping line. Top inset retracts to reveal upward from the
 * bottom edge; bottom inset advances to consume from the same edge on exit.
 */
export function wipe(enter: number, exit: number): string {
  const top = (1 - enter) * 104;
  const bottom = (1 - exit) * 104;
  return `inset(${top.toFixed(2)}% -6% ${bottom.toFixed(2)}% -2%)`;
}
