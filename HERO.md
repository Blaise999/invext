# Hero — back to the simple version, new names and paths

## What changed

Went back to how this worked the first few times: **you declare where the
frames are, the component draws them.** The server directory scan is gone —
that machinery existed to *guess* naming, and the guessing was what kept
breaking. You know your filenames.

`components/Hero.tsx`, top of file:

```ts
const SEQ_DESKTOP: SeqConfig = {
  dir: "seq", stem: "frame_", ext: "webp", pad: 3, first: 1, frameCount: 1000,
};

const SEQ_MOBILE: SeqConfig = {
  dir: "seq-m", stem: "frame_", ext: "webp", pad: 3, first: 1, frameCount: 1000,
};
```

That builds `/seq/frame_001.webp` … `/seq/frame_1000.webp` and the same under
`/seq-m/`. Re-render at different names later and this is the only thing you
edit.

**`pad: 3`, not 4.** `%03d` pads to a *minimum* of three, so frame 1000 keeps
four digits instead of truncating. `padStart(3)` reproduces that exactly — it's
a no-op once a number is already longer. Verified: `frame_001.webp`,
`frame_501.webp` and `frame_1000.webp` all serve 200, and `frame_0001.webp`
404s, which is the proof pad 3 is right.

`app/page.tsx` no longer imports or awaits `readSequences`. `lib/sequence-server.ts`
is unused and can be deleted.

## The space under the hero

Two things were causing it:

1. **The pin ran 3.15 viewports for three plates** — about a third of a screen
   of scroll happened after the last plate had finished. Now **2.6**, and
   **1.55** on phones where the same distance is twice the thumb work.
2. **The first zone had a full section's top padding** stacked under a hero
   that had already ended. Now 44px, 30px on mobile.

## 1000 frames

The component samples evenly across the whole sequence and budgets by **bytes**,
not frame count — a count says nothing about memory. It fetches frame one at
native size, reads the real dimensions off it, then decodes everything else at
painted size with a long-edge cap.

```
desktop  cap 1280   →  ~63 frames   ≈ 232 MB
mobile   cap  720   →  ~86 frames   ≈ 100 MB
```

The old rule (150 desktop / 80 mobile, fixed) worked out to 864 MB and 461 MB
at these dimensions, which is what gets a mobile tab killed mid-scroll. It logs
its choice in dev:

```
[hero] /seq/ 1000 frames at 1600x900 — sampling 63 at 1280x720 ≈ 232 MB
```

If frame one can't be fetched it says so plainly instead of leaving a black
rectangle:

```
[hero] could not load /seq/frame_001.webp — check the folder and filenames
```

## Thin the sequence

```bash
node tools/thin-frames.mjs public/seq 180
node tools/thin-frames.mjs public/seq-m 140
```

Writes `public/seq-thin/` renumbered from 1, same stem and padding. Nothing is
deleted — check it, then swap.

Worth doing: 1000 frames over 2.6 viewports is about one frame per three pixels
of scroll, far past perception, and the client only holds 60–90 decoded anyway.
So most of that download is fetched, decoded and discarded. 180 frames with
damping looks identical and is roughly six times lighter.

## About the Python tool

`render_frames.py` generated the *original* filament sequence — it was the frame
source, not part of the hero. You have your own renders now, so it isn't needed.
`thin-frames.mjs` is the only tool that still applies.

## Files

```
components/ScrollSequence.tsx   rewritten — explicit config, byte budget
components/Hero.tsx             SEQ_DESKTOP / SEQ_MOBILE, shorter pin
components/ReadingProgress.tsx  mobile progress bar
app/globals.css                 mobile rails + hero-exit spacing
app/page.tsx                    readSequences removed
tools/thin-frames.mjs           sequence thinner
```
