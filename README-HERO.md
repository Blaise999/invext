# Hero — the version that worked, with your naming

Three files. Drop them over your copy. Nothing else changes.

## 1. The naming (components/Hero.tsx)

```ts
const pad = (i: number) => String(i).padStart(3, "0");

const DESKTOP = {
  src: (i: number) => `/seq/frame_${pad(i + 1)}.webp`,
  frameCount: 1000, width: 1920, height: 1080,
};

const MOBILE = {
  src: (i: number) => `/seq-m/frame_${pad(i + 1)}.webp`,
  frameCount: 1000, width: 1080, height: 1920,
};
```

Two differences from `iris_0000`:

- **pad 3, not 4.** `%03d` pads to a *minimum* of three, so frame 1000 keeps
  four digits rather than truncating. `padStart(3)` matches that exactly.
- **Starts at 1, not 0**, so index `i` maps to file `i + 1`.

`frameCount` may be higher than what is on disk — missing frames are skipped,
so render more later without editing this. `width`/`height` are a hint only;
the real dimensions are read off frame one at load.

## 2. Why it broke, and it was not the naming

Sampling. With 96 frames the loader kept every one, and the draw step looked for
the nearest decoded frame within **±14** indices. Once the sequence is 1000
frames the loader can only hold ~63 of them, evenly spaced — and the gap between
them is **17**. The lookup scanned ±14, fell into the hole between samples,
found nothing, and painted nothing. A black rectangle, with every frame
returning 200.

It is now a sorted list of decoded indices plus a binary search, so it cannot
miss whatever the sampling step is.

Two smaller things in the same file:

- **Budget by bytes, not frame count.** 1000 frames at 1920x1080 is 8 GB of
  RGBA. It now measures frame one, caps the decode on the long edge (1280
  desktop, 720 mobile) and takes as many frames as fit a memory ceiling —
  roughly 63 desktop, 86 mobile. Same code works for 96 frames or 1000.
- **A 404 is treated as a missing frame** instead of being handed to the bitmap
  decoder as HTML.

In dev it prints what it decided:

```
[hero] /seq/frame_001.webp is 1920x1080 — sampling 63 of 1000 at 1280x720 ≈ 232 MB
```

and if frame one cannot be read:

```
[hero] could not read /seq/frame_001.webp — check the folder and filenames
```

## 3. The blank strip under the hero on mobile (app/globals.css)

`svh` is the **small** viewport height — the viewport *with* the browser UI
showing. When the URL bar collapses on scroll the visible viewport grows toward
`lvh`, but a stage pinned at `100svh` does not grow with it, so a band of page
background appears underneath. That was the patch of nothing.

`.seq__stage` is now `100dvh`, which tracks the viewport as it actually is,
with `100svh` kept as the fallback and as a `min-height`.

The wrapper deliberately stays in `svh`: sizing it in `dvh` would reflow the
whole page every time the URL bar moved, shifting the scroll position
mid-gesture.

## Verified

1000 files named `frame_001.webp … frame_1000.webp` in both folders:

```
seq/frame_001.webp     200      seq-m/frame_001.webp   200
seq/frame_500.webp     200      seq-m/frame_1000.webp  200
seq/frame_1000.webp    200
seq/frame_0001.webp    404   ← confirms pad 3 is right
```

Requests the hero makes: `/seq/frame_001.webp`, `frame_017`, `frame_033`,
`frame_049`, `frame_065` … `frame_1000`.

## If it is still slow

Thin the sequence. 1000 frames over ~3 viewports is about one frame per three
pixels of scroll — past perception, and only ~63 are held anyway, so most of the
download is fetched, decoded and discarded. 180 frames looks identical and is
six times lighter. Any even subset works; just renumber from 001.
