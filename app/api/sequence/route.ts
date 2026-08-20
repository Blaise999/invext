import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * SEQUENCE MANIFEST
 *
 * The hero used to work out its own frame source in the browser: guess a naming
 * convention, HEAD-request it, guess again on a 404, then binary-search for the
 * last frame. Roughly twenty round trips before the first pixel, and — the part
 * that actually bit — a silent black canvas whenever the real files didn't match
 * one of the guesses. That is what "LOADING SEQUENCE 100%" over an empty stage
 * was: every fetch 404ing, the done counter climbing anyway, nothing to paint.
 *
 * The server can just look. One request, no guessing, and if the directory is
 * empty we find out immediately and say so instead of failing into black.
 *
 * Any zero-padding, any of the four extensions, any starting number — the files
 * on disk define the convention rather than having to match one.
 */

export const dynamic = "force-dynamic";

const EXT = /\.(webp|jpg|jpeg|png|avif)$/i;
/** Trailing run of digits is the frame number, whatever the stem is called. */
const NUMBERED = /^(.*?)(\d+)\.(webp|jpg|jpeg|png|avif)$/i;

export interface SequenceManifest {
  dir: string;
  /** Literal prefix, e.g. "frame_". */
  stem: string;
  ext: string;
  /** Zero-padding width taken from the files themselves. */
  pad: number;
  /** Number on the first file — 0 and 1 are both common out of ffmpeg. */
  first: number;
  count: number;
}

async function scan(dir: string): Promise<SequenceManifest | null> {
  let entries: string[];
  try {
    entries = await readdir(path.join(process.cwd(), "public", dir));
  } catch {
    return null; // directory absent — a valid answer, not an error
  }

  // Group by (stem, ext). A directory holding both the old iris frames and a
  // new frame_* render is normal during a swap; we take whichever group is
  // larger rather than whichever happens to sort first.
  const groups = new Map<string, { nums: number[]; stem: string; ext: string; pad: number }>();

  for (const name of entries) {
    if (!EXT.test(name)) continue;
    const m = NUMBERED.exec(name);
    if (!m) continue;
    const [, stem, digits, ext] = m;
    const key = `${stem}|${ext.toLowerCase()}`;
    const g = groups.get(key) ?? { nums: [], stem, ext: ext.toLowerCase(), pad: digits.length };
    g.nums.push(Number(digits));
    // Mixed padding in one directory (frame_9 next to frame_010) is a broken
    // render, but the widest padding is the safer read of intent.
    g.pad = Math.max(g.pad, digits.length);
    groups.set(key, g);
  }

  let best: SequenceManifest | null = null;
  for (const g of groups.values()) {
    if (g.nums.length < 2) continue;
    g.nums.sort((a, b) => a - b);
    const first = g.nums[0];
    const count = g.nums.length;
    if (!best || count > best.count) {
      best = { dir, stem: g.stem, ext: g.ext, pad: g.pad, first, count };
    }
  }

  return best;
}

export async function GET() {
  const [desktop, mobile] = await Promise.all([scan("seq"), scan("seq-m")]);

  return NextResponse.json(
    { desktop, mobile },
    {
      // Contents change only when someone drops a new render in, so a short
      // cache is safe and keeps this off the critical path on repeat views.
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" },
    },
  );
}
