/**
 * HERO FRAME SOURCE
 *
 * The hero is a numbered still sequence scrubbed by scroll. Two things about
 * that are awkward in practice, and both are handled here rather than being
 * left as instructions in a README that nobody reads:
 *
 *   1. NAMING. Renders come out of Blender / After Effects / ffmpeg with
 *      whatever padding and extension the operator happened to use —
 *      frame_001.png, frame_0001.webp, frame_1.jpg. Rather than hard-coding one
 *      convention and silently rendering black when it doesn't match, we probe a
 *      short list of candidates and use the first that answers.
 *
 *   2. COUNT. "About a thousand" is not a number a loader can use. We find the
 *      real last frame by doubling until a request 404s, then binary-searching
 *      the gap — roughly twenty HEAD requests, all cacheable, once per mount.
 *
 * The practical effect: drop your sequence into /public/seq/ — which is where
 * the frame_001... render now lives — and it works. Drop nothing in and the
 * shipped iris sequence plays instead, so the page is never broken while a
 * render is still on someone's workstation.
 */

export interface SeqSource {
  id: string;
  /** Path for frame i, where i is 0-based regardless of the file numbering. */
  src: (i: number) => string;
  frameCount: number;
  /** Native pixel size of a frame — used to compute decode and crop geometry. */
  width: number;
  height: number;
  /**
   * Ceiling on frames actually decoded into memory.
   *
   * Decoded RGBA is the real cost, not the download: a thousand 1920x1080
   * frames is ~8 GB of bitmap, which is not a slow page, it is a reaped tab.
   * We sample this many evenly across the sequence and scrub the sample. At
   * ~120 frames over a three-viewport pin the eye reads continuous motion.
   */
  budget: number;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/* ------------------------------------------------------------ candidates -- */

interface Candidate {
  dir: string;
  stem: string;
  padTo: number;
  ext: string;
  /** Whether the first file on disk is numbered 0 or 1. */
  base: 0 | 1;
}

/**
 * Ordered by likelihood. First one that answers wins.
 *
 * `seq` leads because that is where the working sequence actually lives: the
 * render was dropped into /public/seq alongside the iris frames it replaces.
 * `hero-frames` is kept behind it so an operator who follows the old README
 * still gets a working page instead of a black canvas.
 *
 * The iris fallback is probed last, and only as a stem — if frame_* answers in
 * /seq we never look at it.
 */
const CANDIDATES: Candidate[] = [
  { dir: "seq", stem: "frame_", padTo: 4, ext: "webp", base: 1 },
  { dir: "seq", stem: "frame_", padTo: 3, ext: "webp", base: 1 },
  { dir: "seq", stem: "frame_", padTo: 4, ext: "jpg", base: 1 },
  { dir: "seq", stem: "frame_", padTo: 3, ext: "jpg", base: 1 },
  { dir: "seq", stem: "frame_", padTo: 4, ext: "png", base: 1 },
  { dir: "seq", stem: "frame_", padTo: 3, ext: "png", base: 1 },
  { dir: "seq", stem: "frame_", padTo: 4, ext: "webp", base: 0 },
  { dir: "seq", stem: "frame_", padTo: 3, ext: "webp", base: 0 },
  { dir: "seq", stem: "frame_", padTo: 5, ext: "webp", base: 1 },
  { dir: "seq", stem: "frame_", padTo: 5, ext: "png", base: 1 },
  { dir: "hero-frames", stem: "frame_", padTo: 4, ext: "webp", base: 1 },
  { dir: "hero-frames", stem: "frame_", padTo: 3, ext: "webp", base: 1 },
  { dir: "hero-frames", stem: "frame_", padTo: 4, ext: "jpg", base: 1 },
  { dir: "hero-frames", stem: "frame_", padTo: 3, ext: "jpg", base: 1 },
  { dir: "hero-frames", stem: "frame_", padTo: 4, ext: "png", base: 1 },
  { dir: "hero-frames", stem: "frame_", padTo: 3, ext: "png", base: 1 },
];

const pathFor = (c: Candidate, fileNo: number) =>
  `/${c.dir}/${c.stem}${pad(fileNo, c.padTo)}.${c.ext}`;

/* ------------------------------------------------------------- fallbacks -- */

/**
 * The sequence that ships in the repo. 900x630 landscape, 96 frames, and a
 * 760x960 portrait cut for narrow viewports — a landscape frame letterboxes
 * badly on a phone and the fine detail turns to mush.
 */
export const FALLBACK_DESKTOP: SeqSource = {
  id: "seq",
  src: (i) => `/seq/iris_${pad(i, 4)}.webp`,
  frameCount: 96,
  width: 900,
  height: 630,
  budget: 96,
};

export const FALLBACK_MOBILE: SeqSource = {
  id: "seq-m",
  src: (i) => `/seq-m/iris_${pad(i, 4)}.webp`,
  frameCount: 64,
  width: 760,
  height: 960,
  budget: 64,
};

/* ----------------------------------------------------------------- probe -- */

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "force-cache" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Doubling search for the upper bound, then binary search the gap.
 * `cap` stops a misconfigured directory from spinning forever.
 */
async function countFrames(c: Candidate, cap = 4096): Promise<number> {
  let hi = 1;
  while (hi < cap && (await exists(pathFor(c, c.base + hi)))) hi *= 2;

  let lo = Math.floor(hi / 2);
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await exists(pathFor(c, c.base + mid))) lo = mid;
    else hi = mid;
  }
  return lo + 1; // count, not index
}

/** Natural size of a frame, read from the first one. */
function measure(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight });
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

/**
 * Resolve the sequence to play. Called once per mount, client-side only.
 *
 * `narrow` selects the portrait fallback; a custom hero-frames directory is
 * used for both orientations, since we can't know the operator rendered a
 * portrait cut and a stretched landscape frame beats no frame at all.
 */
export async function resolveSequence(narrow: boolean): Promise<SeqSource> {
  for (const c of CANDIDATES) {
    const first = pathFor(c, c.base);
    if (!(await exists(first))) continue;

    const [frameCount, size] = await Promise.all([countFrames(c), measure(first)]);
    if (frameCount < 2) continue;

    const width = size?.width ?? 1920;
    const height = size?.height ?? 1080;

    // Sample harder on phones: less memory, smaller screen, shorter pin.
    const budget = Math.min(frameCount, narrow ? 84 : 144);

    return {
      id: `${c.dir}/${c.stem}${c.padTo}${c.ext}`,
      src: (i) => pathFor(c, c.base + i),
      frameCount,
      width,
      height,
      budget,
    };
  }

  return narrow ? FALLBACK_MOBILE : FALLBACK_DESKTOP;
}
