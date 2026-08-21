import type { Clip } from "@/lib/media";

/**
 * VIDEO WALL
 *
 * Everything here is a real file on a real CDN, played by the browser's own
 * player. Two changes from the last version, both of them repairs:
 *
 *   1. The clips are resolved through /asset/{nasa_id} now. A NASA video
 *      search result contains only thumbnails and a captions file — no mp4 —
 *      so the old code was passing a JPEG URL to <video src>. A <video> handed
 *      an image does not raise an error. It renders an empty player and sits
 *      there, which is exactly what you were seeing.
 *
 *   2. The YouTube channel embeds are gone. They pointed at UU uploads
 *      playlists, which YouTube stopped serving reliably through the embed
 *      player years ago — a wrong or unserved playlist fails silently as a
 *      blank frame rather than an error, so it looks identical to a bug.
 *      A link out to the channel cannot break; an embed that shows an error
 *      box on a landing page is worse than no embed.
 *
 * Everything is public domain, so there is no licence footnote to keep true
 * and nothing to rehost. Note that SpaceX's Flickr was CC0 only until
 * December 2019 and the licence was then retroactively narrowed — do not
 * build on the old assumption.
 */

const CHANNELS = [
  {
    href: "https://www.youtube.com/@SpaceX",
    label: "SpaceX",
    note: "Launches, landings and crewed missions, from the operator",
  },
  {
    href: "https://www.youtube.com/@NASA",
    label: "NASA",
    note: "Mission coverage, including flights flown on SpaceX vehicles",
  },
];

export default function VideoWall({ clips }: { clips: Clip[] }) {
  return (
    <div className="wall">
      {clips.map((c, i) => (
        <figure className={i === 0 ? "wall__i wall__i--lead" : "wall__i"} key={c.id}>
          <div className="wall__frame">
            {/* preload="none" so a wall of clips costs nothing until one is
                asked for; the poster carries the frame in the meantime. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={c.src}
              poster={c.poster}
              controls
              preload="none"
              playsInline
              aria-label={c.title}
            />
          </div>
          <figcaption className="wall__cap">
            <span className="wall__label">{c.title}</span>
            <span className="mono wall__note">{c.credit} · public domain</span>
          </figcaption>
        </figure>
      ))}

      {/* If NASA is unreachable at build time the wall would otherwise render
          as an empty grid with two captions and no explanation. */}
      {clips.length === 0 && (
        <p className="wall__empty mono">
          Footage library unavailable — try the official channels below.
        </p>
      )}

      {CHANNELS.map((ch) => (
        <figure className="wall__i wall__i--link" key={ch.href}>
          <a className="wall__out" href={ch.href} target="_blank" rel="noreferrer noopener">
            <span className="wall__outLabel">{ch.label}</span>
            <span className="mono wall__outNote">{ch.note}</span>
            <span className="mono wall__outGo">Watch on YouTube →</span>
          </a>
        </figure>
      ))}
    </div>
  );
}
