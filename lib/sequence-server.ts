import "server-only";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { imageSize } from "./image-size";

/**
 * SEQUENCE RESOLUTION — on the server, at render time.
 *
 * Every previous version of this resolved in the browser, and every one of them
 * had the same shape of failure: the page loads, something async goes looking
 * for frames, and if any step of it comes back empty the hero is a black
 * rectangle with no indication of why. Guessing filenames with HEAD requests
 * failed that way. So did fetching a manifest and then measuring frame one.
 *
 * The server can see the directory. It reads it, works out the naming from the
 * files that are actually there, reads the dimensions out of the first frame's
 * header, and passes the finished answer to the hero as a prop. By the time any
 * JavaScript runs in the browser, the sequence is already known — there is no
 * resolution step left to fail.
 *
 *   /public/seq     landscape frames, wide viewports
 *   /public/seq-m   portrait frames, phones
 *
 * Naming is whatever you rendered: frame_001.webp, frame_0001.png, iris_0000.webp.
 * Padding, extension and starting number all come from the files.
 */

export interface SeqVariant {
  /** Directory under /public, without slashes. */
  dir: string;
  stem: string;
  ext: string;
  pad: number;
  /** Number on the first file — ffmpeg starts at 1, Blender often at 0. */
  first: number;
  frameCount: number;
  width: number;
  height: number;
  /**
   * Explicit frame numbers, sent only when they aren't a simple run.
   *
   * A complete sequence from `first` upward needs no list — the client derives
   * `first + i`. A sequence with holes in it (a render that died and was
   * resumed, frames deleted by hand) would 404 on every gap, so in that case
   * the real numbers travel with it. A thousand integers is a few KB of JSON,
   * and it only happens when the alternative is a broken hero.
   */
  numbers?: number[];
}

export interface HeroSequences {
  desktop: SeqVariant | null;
  mobile: SeqVariant | null;
}

const EXT = /\.(webp|avif|png|jpe?g)$/i;
/** Trailing run of digits is the frame number, whatever the stem is. */
const NUMBERED = /^(.*?)(\d+)\.(webp|avif|png|jpe?g)$/i;

const frameName = (v: Pick<SeqVariant, "stem" | "pad" | "ext">, n: number) =>
  `${v.stem}${String(n).padStart(v.pad, "0")}.${v.ext}`;

async function scan(dir: string): Promise<SeqVariant | null> {
  const abs = path.join(process.cwd(), "public", dir);

  let entries: string[];
  try {
    entries = await readdir(abs);
  } catch {
    return null; // directory absent — a valid answer, not an error
  }

  /**
   * Group by (stem, extension) and take the largest group.
   *
   * A directory holding both an old iris_* sequence and a new frame_* render is
   * the normal state during a swap. Taking the biggest group means dropping a
   * thousand new frames in beside ninety-six old ones does the right thing
   * without anyone having to delete anything first.
   */
  const groups = new Map<string, { nums: number[]; stem: string; ext: string; pad: number }>();

  for (const name of entries) {
    if (!EXT.test(name)) continue;
    const m = NUMBERED.exec(name);
    if (!m) continue;
    const [, stem, digits, ext] = m;
    const key = `${stem}|${ext.toLowerCase()}`;
    const g = groups.get(key) ?? { nums: [], stem, ext: ext.toLowerCase(), pad: digits.length };
    g.nums.push(Number(digits));
    /**
     * Narrowest padding wins, and this is the whole ballgame.
     *
     * `frame_%03d` over a thousand frames produces frame_001 ... frame_999 and
     * then frame_1000 — printf pads to a minimum width, it does not truncate,
     * so the last file carries four digits. Taking the *widest* padding seen
     * therefore reads 4 off that one file and generates frame_0001.webp for
     * every frame, which is a 404 on all thousand of them. One overflowing file
     * redefined the convention for the entire sequence.
     *
     * The narrowest width is the actual format string: padStart is a no-op once
     * a number is longer than the pad, so 3 gives "001" and "1000" correctly,
     * and a genuine %04d render reports 4 from every file and still gives
     * "0001" and "1000". Both conventions come out right.
     */
    g.pad = Math.min(g.pad, digits.length);
    groups.set(key, g);
  }

  let best: { nums: number[]; stem: string; ext: string; pad: number } | null = null;
  for (const g of groups.values()) {
    if (g.nums.length < 2) continue;
    if (!best || g.nums.length > best.nums.length) best = g;
  }
  if (!best) return null;

  best.nums.sort((a, b) => a - b);
  const first = best.nums[0];
  const last = best.nums[best.nums.length - 1];

  /**
   * Verify before trusting. The padding rule above is sound, but a directory can
   * always hold something neither rule anticipated, and the failure mode we keep
   * hitting is a silent one — paths that look plausible and 404 on every frame.
   *
   * So check that the names we intend to generate are names that exist: the
   * first, the last, and one in the middle. If they don't match, the derived
   * naming is wrong and the real numbers get shipped instead of guessed.
   */
  const have = new Set(entries);
  const shape = { stem: best.stem, pad: best.pad, ext: best.ext };
  const probes = [first, best.nums[best.nums.length >> 1], last];
  const namingHolds = probes.every((n) => have.has(frameName(shape, n)));

  // Contiguous means index i maps to first + i and no list is needed.
  const contiguous = last - first + 1 === best.nums.length;

  const size = await imageSize(path.join(abs, frameName(shape, first)));

  return {
    dir,
    stem: best.stem,
    ext: best.ext,
    pad: best.pad,
    first,
    frameCount: best.nums.length,
    // Header parse covers webp/png/jpeg. The defaults are only reached for a
    // format we can't read, and a wrong aspect crops badly rather than failing.
    width: size?.width ?? 1600,
    height: size?.height ?? 900,
    ...(contiguous && namingHolds ? {} : { numbers: best.nums }),
  };
}

/**
 * Read both sequences. Called from the page (a server component), so this runs
 * per render — cheap, since it's one readdir and a 32-byte read per directory.
 */
export async function readSequences(): Promise<HeroSequences> {
  const [desktop, mobile] = await Promise.all([scan("seq"), scan("seq-m")]);

  if (process.env.NODE_ENV !== "production") {
    const describe = (v: SeqVariant | null, label: string) =>
      v
        ? `${label}: ${v.frameCount} frames, /${v.dir}/${frameName(v, v.first)} … ${frameName(v, v.first + v.frameCount - 1)} (pad ${v.pad}) → ${v.width}x${v.height}${v.numbers ? " [explicit numbering]" : ""}`
        : `${label}: NONE — nothing numbered found in /public/${label === "desktop" ? "seq" : "seq-m"}`;
    console.log("[hero]", describe(desktop, "desktop"), "|", describe(mobile, "mobile"));
  }

  return { desktop, mobile };
}
