import { readdir, writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const EXT = /\.(webp|avif|png|jpe?g)$/i;
const NUMBERED = /^(.*?)(\d+)\.(webp|avif|png|jpe?g)$/i;

const frameName = (v, n) =>
  `${v.stem}${String(n).padStart(v.pad, "0")}.${v.ext}`;

async function imageSize(filePath) {
  try {
    const buf = await readFile(filePath);
    // WebP (very rough – keep your real helper if you have one)
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
      return { width: 1600, height: 900 };
    }
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
      };
    }
  } catch {}
  return { width: 1600, height: 900 };
}

async function scan(dir) {
  const abs = path.join(ROOT, "public", dir);

  let entries;
  try {
    entries = await readdir(abs);
  } catch {
    return null;
  }

  const groups = new Map();

  for (const name of entries) {
    if (!EXT.test(name)) continue;
    const m = NUMBERED.exec(name);
    if (!m) continue;
    const [, stem, digits, ext] = m;
    const key = `${stem}|${ext.toLowerCase()}`;
    const g = groups.get(key) ?? {
      nums: [],
      stem,
      ext: ext.toLowerCase(),
      pad: digits.length,
    };
    g.nums.push(Number(digits));
    // CRITICAL: narrowest padding wins
    g.pad = Math.min(g.pad, digits.length);
    groups.set(key, g);
  }

  let best = null;
  for (const g of groups.values()) {
    if (g.nums.length < 2) continue;
    if (!best || g.nums.length > best.nums.length) best = g;
  }
  if (!best) return null;

  best.nums.sort((a, b) => a - b);
  const first = best.nums[0];
  const last = best.nums[best.nums.length - 1];

  const have = new Set(entries);
  const shape = { stem: best.stem, pad: best.pad, ext: best.ext };
  const probes = [first, best.nums[best.nums.length >> 1], last];
  const namingHolds = probes.every((n) => have.has(frameName(shape, n)));

  const contiguous = last - first + 1 === best.nums.length;

  const size = await imageSize(path.join(abs, frameName(shape, first)));

  return {
    dir,
    stem: best.stem,
    ext: best.ext,
    pad: best.pad,
    first,
    frameCount: best.nums.length,
    width: size?.width ?? 1600,
    height: size?.height ?? 900,
    ...(contiguous && namingHolds ? {} : { numbers: best.nums }),
  };
}

const [desktop, mobile] = await Promise.all([scan("seq"), scan("seq-m")]);

const outDir = path.join(ROOT, "src", "lib");
const outPath = path.join(outDir, "seq-manifest.json");

// Create folder if missing
await mkdir(outDir, { recursive: true });

await writeFile(outPath, JSON.stringify({ desktop, mobile }, null, 2));

console.log("[seq-manifest] written →", outPath);
if (desktop) console.log("  desktop:", desktop.frameCount, "frames");
if (mobile)  console.log("  mobile: ", mobile.frameCount, "frames");