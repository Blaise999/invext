# Hero — what was broken and what it does now

Three earlier hero docs contradicted each other. They're gone; this is the only
one.

---

## 1. Why nothing rendered in production

**The folder was `Public/`, capital P.**

Next serves static files from a lower-case `public/` and nothing else. macOS
and Windows use case-insensitive filesystems, so `Public/seq/frame_001.webp`
resolved locally and `npm run dev` looked perfect. Git recorded the capital.
Linux hosts are case-sensitive, so on the deploy every frame 404'd.

That matches the symptom exactly: one request for `frame_001.webp`, nothing
after it, blank stage. The old loader fetched frame one, got a 404, threw, and
`return`ed out of the whole load routine — so no second request was ever made.
The network tab showed a single entry because there genuinely was only one.

The folder is renamed in this zip. **Git will not pick up a case-only rename on
your machine** — you have to force it:

```bash
git mv Public public-tmp
git mv public-tmp public
git add -A
git commit -m "public/ lower case — Linux hosts are case-sensitive"
```

Then confirm the tree is right before you push:

```bash
git ls-files | grep -i '^public' | head
```

If that still prints a capital `P`, the rename didn't take.

**Guard against a repeat.** The loader now checks the `content-type` on frame
one. A 404 HTML page is no longer handed to the image decoder, and the stage
shows a named failure instead of a black rectangle — in dev the console spells
out the case trap by name.

---

## 2. The frame count is no longer declared

`frameCount: 1000` was a guess, and a wrong guess is worse than no guess. The
loader samples evenly across the *declared* range, so if the real count is 96
and you claim 1000, roughly 90% of the scroll maps onto files that don't exist.
The scrub plays through the first sliver of the render and then freezes.

It's now probed off the server: double until a frame is missing, then binary
search the boundary. Verified exact for every count from 0 to 2200, worst case
25 HEAD requests — 21 for a thousand frames, 15 for 96. They run *in parallel*
with the frame-one download, so they cost no visible time.

Drop new renders in and change nothing. `SeqConfig` is now just:

```ts
const SEQ_DESKTOP: SeqConfig = {
  dir: "seq", stem: "frame_", ext: "webp", pad: 3, first: 1,
};
```

`pad: 3` is right, not 4 — `%03d` pads to a *minimum* of three, so frame 1000
keeps four digits. `padStart(3)` reproduces that exactly.

Set `frameCount` back only if you want to skip the probe and you're certain.

---

## 3. Memory, which is the real budget

Your masters:

```
public/seq/     1920 x 1080     landscape
public/seq-m/   1920 x 3413     portrait
```

Download size isn't what kills a mobile tab; decoded RGBA is. One mobile master
decoded at native size is **26 MB of RAM**. Twenty of them is half a gigabyte
and Safari reaps the tab mid-scroll — which looks like the hero going blank.

Frames are decoded at the size they'll actually be painted, and taken evenly
across the sequence until a byte ceiling is hit:

```
desktop   cap 1280 long edge  ->  1280x720   3.7 MB/frame  ->  ~65 frames  ~240 MB
mobile    cap  960 long edge  ->   540x960   2.1 MB/frame  ->  ~57 frames  ~120 MB
```

It logs the decision in dev:

```
[hero] /seq/ — 96 frames on disk at 1920x1080; sampling 65 decoded at 1280x720 ≈ 240 MB
```

**Your levers are smaller frames or fewer frames. Never more frames.**

### One thing worth doing on your side

Your mobile masters are 1920 wide and ~240 KB each. That's four times more
pixels than a phone can show and roughly four times the bytes. At ~57 sampled
frames you're pushing **13 MB** down a phone connection to paint something that
never exceeds 540x960.

Re-export `seq-m` at 810x1440:

```bash
ffmpeg -i mobile.mp4 -vf "fps=24,scale=810:-2" -c:v libwebp -q:v 62 \
  public/seq-m/frame_%03d.webp
```

Same look, about a fifth of the transfer. Nothing in the code changes — the
dimensions are read off frame one.

---

## 4. Scroll doesn't move on until the copy has landed

Plate three used to finish saying everything at **p = 0.75**. The remaining
quarter of the pin was scroll that changed nothing — which is what reads as
"blank space under the hero" even when the stage is still full-bleed.

`envelopeAt` now gives the last plate a 0.86 rise instead of 0.34, so it lands
at **p = 0.92**: the copy finishes just before the pin releases, not long
before it. Pin length went the other way — 2.7 viewports on desktop, 2.0 on
mobile (was 1.55) — so a flick can't skip a plate.

---

## 5. The blank strip under the stage

`svh` is the **small** viewport height — the viewport *with* the mobile URL bar
showing. Pin a stage at `100svh` and the moment the bar collapses the visible
viewport grows toward `lvh`, the stage doesn't grow with it, and a band of page
background appears underneath. That was the strip.

The stage is now `100lvh` — the viewport with the bar hidden, i.e. the largest
it ever gets, so it can never be shorter than what's on screen. Unlike `dvh` it
is a constant, so it never reflows mid-gesture.

The wrapper stays in `svh` deliberately: sizing it in `dvh` would change the
page height every time the bar moved, shifting the scroll position under the
reader's thumb.

The copy overlay is `100svh`, so wordmark, plates and transport all sit inside
the area that's visible *with* the bar down. Only the canvas runs to the full
`lvh`.

**And the piece that ties it together:** progress is now measured against the
stage's height, not `window.innerHeight`.

```ts
const travel = wrap.offsetHeight - stage.offsetHeight;
```

The pin releases when the wrapper's bottom meets the stage's bottom, which is
`lvh - svh` earlier than `innerHeight` implies. Measuring against the stage
makes progress hit exactly 1.0 at the instant the pin lets go — no frozen tail,
no early finish.

Below that, `.seq + *` has its margin zeroed and the first zone's lead-in is cut
to 40px (28px on mobile). A section needs space between it and the next one; it
doesn't need space above it when a whole pinned screen just ended.

---

## 6. Legibility

- The scrim is three crossed gradients now, including a top band so the
  wordmark sits on something rather than on open sky.
- `.hero` explicitly declares `filter: none`. The canvas blurs during a
  hand-off; the type must never inherit that.
- Type carries a tight, near-black shadow — small radius, so it sharpens
  instead of haloing.
- The logo gets its own `drop-shadow`.

**A bug fixed while I was in there:** `--heat` was being set on `.hero`, but the
CSS reads it on `.seq__canvas`, which is `.hero`'s *sibling*, not its child. The
variable never resolved, so the focus-pull at each hand-off had been silently
doing nothing. It's now written to the stage from the rAF loop, so it reaches
both — and costs no React render.

`cropAt` was in the same state: fully written, exported, never called. The
canvas ignored it and used a fixed crop. It's wired in now, which also means
the image is never dead still at any scroll position — worth having when
several scroll positions resolve to the same sampled frame.

---

## 7. Damping

Unchanged in spirit, since it was already right:

```ts
current += (target - current) * damping;   // 0.14
```

Scroll only ever writes `target`. A rAF loop eases `current` toward it. That
single line is most of what reads as weight.

One addition: `onProgress` now fires only when progress moves more than
0.0015. Re-rendering three plates sixty times a second was the largest cost in
this hero on a phone, and below that threshold nothing on screen would move.

---

## 8. The video wall

Separate bug, same class of silent failure.

A NASA search for `media_type=video` returns **thumbnail JPEGs and a captions
file in `links[]` — no video file at all**. The old code took `links[0].href`,
swapped `~thumb.jpg` for `~medium.jpg`, and passed the resulting JPEG to
`<video src>`. A `<video>` handed an image doesn't raise an error; it renders an
empty player and sits there.

The real files need a second request to `/asset/{nasa_id}`, which returns one
entry per rendition. `nasaClips()` in `lib/media.ts` does that now, picks the
smallest usable mp4 (`~mobile` → `~small` → `~medium` → …), and keeps the
thumbnail as a `poster`. Two API quirks it handles: some video IDs contain
literal spaces in their hrefs, and several come back as `http://`.

**The YouTube embeds are gone.** They pointed at `UU` uploads playlists, which
YouTube stopped serving reliably through the embed player years ago — and a
playlist it won't serve fails as a blank frame, not an error, so it looks
identical to a bug. They're now link-out cards. An embed that shows an error box
on a landing page is worse than no embed.

---

## Removed

```
lib/sequence-server.ts     server directory scan — superseded by the probe
app/api/sequence/          same
lib/hero-frames.ts         client-side naming guesser, already unused
tools/render_frames.py     generated the original placeholder frames
HERO-NOTES.md              contradicted this file
README-HERO.md             contradicted this file
```

`tools/thin-frames.mjs` stays — it's still the right tool if you decide 1000
frames is more than the scroll can resolve.
