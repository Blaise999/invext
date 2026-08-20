import { open } from "node:fs/promises";

/**
 * Frame dimensions, read from the file header.
 *
 * The hero needs to know the native size of a frame to work out its crop. That
 * used to happen in the browser: load frame one into an Image, wait for onload,
 * read naturalWidth. It worked, but it put a network round trip and an async
 * gate in front of the very first paint — and if it failed for any reason the
 * whole sequence resolved to null and the hero fell back to the poster.
 *
 * Every format here declares its size in the first few dozen bytes, so we read
 * 32 bytes off disk and parse them. No decode, no round trip, no failure path
 * that ends in a blank hero.
 */

export interface Size {
  width: number;
  height: number;
}

/* WebP is three formats behind one container, and they store size differently. */
function webp(b: Buffer): Size | null {
  if (b.length < 30) return null;
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;

  const chunk = b.toString("ascii", 12, 16);

  // Extended: 24-bit width-1 and height-1, little endian, at byte 24.
  if (chunk === "VP8X") {
    const w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
    const h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
    return { width: w, height: h };
  }

  // Lossy: 14-bit dimensions in the VP8 keyframe header, masked off the scale bits.
  if (chunk === "VP8 ") {
    return {
      width: b.readUInt16LE(26) & 0x3fff,
      height: b.readUInt16LE(28) & 0x3fff,
    };
  }

  // Lossless: 14 bits each, packed into a 32-bit little-endian word at byte 21.
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

function png(b: Buffer): Size | null {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/**
 * JPEG needs a walk rather than a fixed offset: the size lives in a start-of-frame
 * marker whose position depends on how much metadata precedes it.
 */
async function jpeg(path: string): Promise<Size | null> {
  const fh = await open(path, "r");
  try {
    const head = Buffer.alloc(2);
    await fh.read(head, 0, 2, 0);
    if (head[0] !== 0xff || head[1] !== 0xd8) return null;

    let pos = 2;
    const seg = Buffer.alloc(9);

    // Bounded: a frame header past 2 MB of metadata is a file we don't want.
    while (pos < 2_000_000) {
      const { bytesRead } = await fh.read(seg, 0, 9, pos);
      if (bytesRead < 9 || seg[0] !== 0xff) return null;

      const marker = seg[1];
      const len = seg.readUInt16BE(2);

      // SOF0-SOF15, excluding the DHT/JPG/DAC markers interleaved in that range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: seg.readUInt16BE(5), width: seg.readUInt16BE(7) };
      }
      pos += 2 + len;
    }
    return null;
  } finally {
    await fh.close();
  }
}

export async function imageSize(path: string): Promise<Size | null> {
  try {
    if (/\.jpe?g$/i.test(path)) return await jpeg(path);

    const fh = await open(path, "r");
    try {
      const buf = Buffer.alloc(32);
      const { bytesRead } = await fh.read(buf, 0, 32, 0);
      if (bytesRead < 24) return null;
      return webp(buf) ?? png(buf);
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}
