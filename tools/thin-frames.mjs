#!/usr/bin/env node
/**
 * Thin a frame sequence on disk.
 *
 *   node tools/thin-frames.mjs public/seq 180
 *   node tools/thin-frames.mjs public/seq-m 140
 *
 * Writes a sibling folder (seq-thin) with an evenly sampled subset, renumbered
 * from 1 with the same stem, padding and extension. Nothing is deleted — check
 * it, then swap the folders yourself.
 *
 * WHY: a scroll-scrubbed hero does not benefit from 1000 frames. Over three
 * viewports of scroll that is roughly one frame per two pixels, far past what
 * anyone can perceive, and the client can only hold ~60-90 decoded anyway — so
 * 90% of the download is fetched, decoded, and thrown away. 150-180 frames with
 * damping is indistinguishable and roughly six times lighter.
 */
import { readdir, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const [dir, targetRaw] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node tools/thin-frames.mjs <dir> [target=180]");
  process.exit(1);
}
const target = Number(targetRaw) || 180;

const NUMBERED = /^(.*?)(\d+)\.(webp|avif|png|jpe?g)$/i;
const entries = await readdir(dir);

const groups = new Map();
for (const name of entries) {
  const m = NUMBERED.exec(name);
  if (!m) continue;
  const [, stem, digits, ext] = m;
  const key = `${stem}|${ext.toLowerCase()}`;
  const g = groups.get(key) ?? { stem, ext: ext.toLowerCase(), pad: digits.length, files: [] };
  // Narrowest padding is the real format string — %03d overflows to 4 digits
  // at frame 1000, and taking the widest would misread the whole sequence.
  g.pad = Math.min(g.pad, digits.length);
  g.files.push({ name, n: Number(digits) });
  groups.set(key, g);
}

let best = null;
for (const g of groups.values()) if (!best || g.files.length > best.files.length) best = g;
if (!best) { console.error(`no numbered frames in ${dir}`); process.exit(1); }

best.files.sort((a, b) => a.n - b.n);
const total = best.files.length;
if (total <= target) {
  console.log(`${dir}: ${total} frames, already at or under ${target} — nothing to do.`);
  process.exit(0);
}

const out = `${dir.replace(/\/+$/, "")}-thin`;
await mkdir(out, { recursive: true });

let written = 0;
for (let i = 0; i < target; i++) {
  const pick = best.files[Math.round((i * (total - 1)) / (target - 1))];
  const name = `${best.stem}${String(i + 1).padStart(best.pad, "0")}.${best.ext}`;
  await copyFile(path.join(dir, pick.name), path.join(out, name));
  written++;
}

console.log(
  `${dir}: ${total} → ${written} frames in ${out}/\n` +
    `  first ${best.stem}${String(1).padStart(best.pad, "0")}.${best.ext}` +
    `  last ${best.stem}${String(written).padStart(best.pad, "0")}.${best.ext}\n` +
    `  check it, then replace ${dir} with ${out}`,
);
