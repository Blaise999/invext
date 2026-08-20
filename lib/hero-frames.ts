/**
 * HERO FRAME SOURCE
 *
 * Resolution now happens on the server (see app/api/sequence/route.ts), which
 * reads the directory and reports what is actually there. This file's only job
 * is to turn that answer into something the canvas loop can index, and to hold
 * the line when the answer is "nothing".
 *
 * Two sequences, deliberately separate:
 *
 *   /public/seq    landscape, used on wide viewports
 *   /public/seq-m  portrait cut, used on phones
 *
 * A landscape frame on a 390x844 screen crops to about a third of its width, so
 * whatever the render was composed around ends up outside the frame. If the
 * portrait cut is missing we fall back to the landscape one rather than showing
 * nothing, but the mobile hero is built assuming seq-m exists.
 */

export interface SeqSource {
  id: string;
  /** Path for frame i, 0-based regardless of how the files are numbered. */
  src: (i: number) => string;
  frameCount: number;
  /** Native pixel size — decode and crop geometry are derived from it. */
  width: number;
  height: number;
  /**
   * Ceiling on frames decoded into memory.
   *
   * Decoded RGBA is the real cost, not the download: a thousand 1920x1080
   * frames is ~8 GB of bitmap, which is not a slow page, it is a reaped tab.
   * We sample this many evenly and scrub the sample.
   */
  budget: number;
}

interface Manifest {
  dir: string;
  stem: string;
  ext: string;
  pad: number;
  first: number;
  count: number;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/* --------------------------------------------------------------- measure -- */

/** Natural size of a frame, read from the first one. */
function measure(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight });
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

function toSource(m: Manifest, narrow: boolean, measured: { width: number; height: number } | null): SeqSource {
  const src = (i: number) => `/${m.dir}/${m.stem}${pad(m.first + i, m.pad)}.${m.ext}`;

  // Sample harder on phones: less memory, smaller screen, shorter pin. Above
  // roughly 120 samples over a three-viewport pin the eye stops being able to
  // tell, so spending more is spending memory for nothing.
  const budget = Math.min(m.count, narrow ? 72 : 132);

  return {
    id: `${m.dir}/${m.stem}*.${m.ext}`,
    src,
    frameCount: m.count,
    width: measured?.width ?? (narrow ? 760 : 1600),
    height: measured?.height ?? (narrow ? 960 : 900),
    budget,
  };
}

/* --------------------------------------------------------------- resolve -- */

/**
 * Ask the server what exists, then measure frame one.
 *
 * Returns null when there is genuinely no sequence on disk. The caller renders
 * a designed poster in that case — a black rectangle with a stuck progress
 * readout is the worst possible failure, because it looks like a bug in the
 * page rather than a missing asset.
 */
export async function resolveSequence(narrow: boolean): Promise<SeqSource | null> {
  let data: { desktop: Manifest | null; mobile: Manifest | null };
  try {
    const res = await fetch("/api/sequence", { cache: "force-cache" });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }

  // Portrait cut preferred on narrow viewports, landscape as the safety net.
  const picked = narrow ? (data.mobile ?? data.desktop) : (data.desktop ?? data.mobile);
  if (!picked || picked.count < 2) return null;

  const firstUrl = `/${picked.dir}/${picked.stem}${pad(picked.first, picked.pad)}.${picked.ext}`;
  const measured = await measure(firstUrl);

  // A manifest that lists files the browser can't actually load means the
  // directory is there but the contents are unreadable — treat as no sequence
  // rather than handing the loop a source that will 404 on every frame.
  if (!measured) return null;

  return toSource(picked, narrow, measured);
}
