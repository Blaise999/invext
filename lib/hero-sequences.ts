import "server-only";
import manifest from "./seq-manifest.json";

export interface SeqVariant {
  dir: string;
  stem: string;
  ext: string;
  pad: number;
  first: number;
  frameCount: number;
  width: number;
  height: number;
  numbers?: number[];
}

export interface HeroSequences {
  desktop: SeqVariant | null;
  mobile: SeqVariant | null;
}

/**
 * Instant — the heavy work already happened at build time.
 */
export function readSequences(): HeroSequences {
  return manifest as HeroSequences;
}

// Helper if you still need it somewhere
export const frameName = (
  v: Pick<SeqVariant, "stem" | "pad" | "ext">,
  n: number,
) => `${v.stem}${String(n).padStart(v.pad, "0")}.${v.ext}`;