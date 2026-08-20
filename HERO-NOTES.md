# Hero motion — how it works, and what changed

## How it works

Three parts, in this order:

**1. The server resolves the sequence.** `lib/sequence-server.ts` does a
`readdir` on `/public/seq` and `/public/seq-m`, groups files by stem and
extension, takes the largest group, and reads the width and height out of the
first frame's header. The result is passed to the hero as a prop.

That matters because every earlier version resolved in the browser — guessing
filenames with HEAD requests, or fetching a manifest — and they all failed the
same way: a black rectangle with no clue why. The server can just look. By the
time any JS runs, the naming is already known.

**2. The client samples and decodes.** `ScrollSequence.tsx` picks an even subset
across the sequence, decodes each at roughly its painted size via
`createImageBitmap`'s resize options, and loads them by binary subdivision —
first and last, then halves, then quarters — so the whole timeline is coarsely
covered within a second instead of the back half being blank when you scrub
there.

**3. Scroll drives a number; rAF paints.** Scroll writes a target; a
`requestAnimationFrame` loop eases the current index toward it and draws the
nearest decoded frame. The damping is what makes it read as motion rather than
a stepped slideshow.

## Your naming already works — verified

I generated 1000 files named exactly like yours and ran the resolver:

```
stem "frame_"   pad 3   first 1   frameCount 1000
first frame_001.webp   mid frame_501.webp   last frame_1000.webp
```

The subtlety it handles: `%03d` pads to a *minimum* of three, so frame 1000
comes out four digits. Reading the widest padding seen would take 4 from that
one file and generate `frame_0001.webp` for everything — a 404 on all thousand.
It takes the **narrowest**, which is the actual format string. `padStart(3)`
then gives `001` and `1000` correctly. Both `%03d` and `%04d` renders work.

Serialised payload confirmed in the HTML: `"stem":"frame_","pad":3,"first":1,
"frameCount":1000`.

## What was actually broken: memory

The budget was a frame count — 150 desktop, 80 mobile. That says nothing about
memory. At your 1600x900 masters:

```
150 x 1600 x 900 x 4  =  864 MB      desktop
 80 x  900 x 1600 x 4 =  461 MB      mobile   ← tab gets reaped
```

Now it derives from bytes, with a long-edge cap on the decode:

```
desktop  cap 1280  ->  1280x720  3.69 MB/frame  ->  63 frames  =  232 MB
mobile   cap  720  ->   405x720  1.17 MB/frame  ->  86 frames  =  100 MB
```

Same code is safe whether the sequence is 96 frames or 1000. In dev it logs
what it chose.

## Thin the sequence

```bash
node tools/thin-frames.mjs public/seq 180
node tools/thin-frames.mjs public/seq-m 140
```

Writes `public/seq-thin/` renumbered from 1 with the same stem and padding.
Nothing is deleted — check it, then swap.

1000 frames over three viewports is about one frame per two pixels of scroll,
far past perception, and the client can only hold 60-90 decoded anyway. So
~90% of the download is fetched, decoded and thrown away. 180 frames with
damping looks identical and is roughly six times lighter.

## Mobile landing

The long-column problem is that every section is the same shape.

- **Card grids become horizontal snap rails** — `.mkt`, `.pgrid`, `.gal`,
  `.deb`, `.nums`. Cards sit at 78% width and bleed to the screen edge so the
  next one peeks. A row you swipe is shorter than a column you scroll, and each
  set reads as its own set.
- **The mosaic re-tiles** into 4 columns with uneven spans instead of marching
  in pairs.
- **Zones alternate** — a warm gradient step on `--alt`, and the index rule
  flips side, so consecutive sections stop looking identical.
- **The timeline becomes a spine** with a gradient rail and dots.
- **A 2px progress bar** so the page has a visible end. It writes a transform on
  a composited element inside rAF, so it costs nothing per frame.

No scroll-jacking, no vertical snap, no auto-advance. Those are what make
people feel lost. A swipe is a gesture the reader starts and stops.

## Files

```
components/ScrollSequence.tsx    byte-derived budget + decode cap
components/ReadingProgress.tsx   new
app/globals.css                  mobile landing block appended
app/page.tsx                     renders <ReadingProgress />
tools/thin-frames.mjs            new
```
