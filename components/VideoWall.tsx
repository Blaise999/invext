import type { Shot } from "@/lib/media";

/**
 * VIDEO
 *
 * Two sources, and the split is a licensing decision rather than a taste one.
 *
 *   NASA. Public domain, hosted as plain MP4, so the file plays inline with no
 *   third-party player and no tracking. These are the ones we can rely on —
 *   they are fetched at request time, so the wall fills itself.
 *
 *   YouTube. Embedded through youtube-nocookie, which is the only lawful way
 *   to show a channel's own footage without a licence. Note that SpaceX's
 *   Flickr was CC0 until December 2019 and the licence was then retroactively
 *   narrowed — do not build on the old assumption and do not rehost.
 *
 * On the playlist IDs below: an embed needs a *playlist*, not a channel. Every
 * channel has an implicit uploads playlist whose ID is the channel ID with the
 * UC prefix swapped for UU. Verify each one renders before shipping; a wrong
 * ID fails as an empty player rather than an error, which is easy to miss.
 */

const CHANNELS = [
  {
    channel: "UCtI0Hodo5L5UhMDy6ZdzNDQ",
    label: "SpaceX",
    note: "Launches, landings and crewed missions, from the operator",
  },
  {
    channel: "UCLA_DiR1FfKNvjuUpBHmylQ",
    label: "NASA",
    note: "Mission coverage, including flights flown on SpaceX vehicles",
  },
];

const uploadsPlaylist = (channelId: string) => "UU" + channelId.slice(2);

export default function VideoWall({ clips }: { clips: Shot[] }) {
  return (
    <div className="wall">
      {clips.map((c, i) => (
        <figure className={i === 0 ? "wall__i wall__i--lead" : "wall__i"} key={c.id}>
          <div className="wall__frame">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={c.src} controls preload="none" playsInline aria-label={c.title} />
          </div>
          <figcaption className="wall__cap">
            <span className="wall__label">{c.title}</span>
            <span className="mono wall__note">{c.credit} · public domain</span>
          </figcaption>
        </figure>
      ))}

      {CHANNELS.map((ch) => (
        <figure className="wall__i wall__i--embed" key={ch.channel}>
          <div className="wall__frame">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/videoseries?list=${uploadsPlaylist(ch.channel)}`}
              title={`${ch.label} — official channel`}
              allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
          <figcaption className="wall__cap">
            <span className="wall__label">{ch.label}</span>
            <span className="mono wall__note">
              {ch.note} · embedded, not affiliated
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
