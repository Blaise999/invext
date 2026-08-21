/**
 * Image and video sourcing.
 *
 * Two providers, both free to use commercially, both fetched server-side and
 * cached. Neither needs a key.
 *
 *   1. NASA Image and Video Library — public domain, images AND video.
 *   2. Wikimedia Commons — freely licensed, and the API returns the licence
 *      short name plus the artist string, so attribution is generated from the
 *      file's own metadata rather than typed by hand and left to rot.
 *
 * What is NOT here, deliberately:
 *   - SpaceX's Flickr. It was CC0 until December 2019, when the licence was
 *     retroactively narrowed. Do not build on the old assumption.
 *   - Tesla press images. All rights reserved.
 *   - Getty / AP / Reuters. Licensed per-use; hotlinking is infringement.
 */

export interface Shot {
  id: string;
  title: string;
  src: string;
  credit: string;
  licence: string;
  licenceUrl?: string;
  sourceUrl?: string;
  kind: "image" | "video";
}

const DAY = 86_400;

/**
 * NASA titles arrive long and often truncated mid-word by the API
 * ("...at Space Launch C"). Trim to the last clean word boundary.
 */
function tidy(t: string, max = 58): string {
  const clean = t.replace(/^NASA['\u2019]s\s+/i, "").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,\-—:]$/, "") + "\u2026";
}

/* ---------------------------------------------------------------- NASA ---- */

export async function nasaMedia(
  query: string,
  count = 4,
  kind: "image" | "video" = "image",
): Promise<Shot[]> {
  try {
    const url =
      `https://images-api.nasa.gov/search?media_type=${kind}` +
      `&page_size=24&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { next: { revalidate: DAY } });
    if (!res.ok) return [];
    const json = await res.json();

    return ((json?.collection?.items ?? []) as any[])
      .filter((i) => i?.links?.[0]?.href && i?.data?.[0]?.title)
      .slice(0, count)
      .map((i) => ({
        id: i.data[0].nasa_id,
        title: tidy(i.data[0].title as string),
        src: String(i.links[0].href).replace("~thumb.jpg", "~medium.jpg"),
        credit: (i.data[0].photographer || i.data[0].center || "NASA") as string,
        licence: "Public domain",
        sourceUrl: `https://images.nasa.gov/details/${i.data[0].nasa_id}`,
        kind,
      }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ video -- */

export interface Clip extends Shot {
  kind: "video";
  /** Playable file. */
  src: string;
  /** Still shown before play, so the wall is not five black rectangles. */
  poster?: string;
}

const MP4 = /\.mp4$/i;
/** Smallest first: a landing page wants a clip that starts, not a master. */
const RENDITION_ORDER = ["~mobile", "~small", "~medium", "~large", "~orig"];

/**
 * Turn one search hit into a playable clip.
 *
 * This is the bug that was leaving the video wall dead. A search response for
 * media_type=video carries only thumbnail JPEGs and a captions .srt in
 * links[] — no video file at all. The old code took links[0].href, swapped
 * ~thumb.jpg for ~medium.jpg, and handed the resulting JPEG to <video src>,
 * which of course renders an empty player with no error.
 *
 * The actual files live behind a second request to /asset/{nasa_id}, which
 * returns one entry per rendition. Two gotchas the API will hand you:
 * some video IDs contain literal spaces in their hrefs, and several come back
 * as http:// rather than https://.
 */
async function resolveClip(item: any): Promise<Clip | null> {
  const meta = item?.data?.[0];
  if (!meta?.nasa_id) return null;

  const links: any[] = item?.links ?? [];
  const poster = links
    .map((l) => String(l?.href ?? ""))
    .find((h) => /\.(jpg|jpeg|png)$/i.test(h));

  try {
    const res = await fetch(
      `https://images-api.nasa.gov/asset/${encodeURIComponent(meta.nasa_id)}`,
      { next: { revalidate: DAY } },
    );
    if (!res.ok) return null;
    const json = await res.json();

    const files = ((json?.collection?.items ?? []) as any[])
      .map((f) => String(f?.href ?? ""))
      // http -> https, and spaces encoded, or the request is rejected outright.
      .map((h) => h.replace(/^http:\/\//, "https://").replace(/ /g, "%20"))
      .filter((h) => MP4.test(h));

    if (files.length === 0) return null;

    const pick =
      RENDITION_ORDER.map((tag) => files.find((f) => f.includes(tag))).find(Boolean) ??
      files[0];

    return {
      id: meta.nasa_id,
      title: tidy(meta.title ?? "NASA footage"),
      src: pick as string,
      poster: poster
        ? poster.replace(/^http:\/\//, "https://").replace(/ /g, "%20")
        : undefined,
      credit: (meta.photographer || meta.center || "NASA") as string,
      licence: "Public domain",
      sourceUrl: `https://images.nasa.gov/details/${meta.nasa_id}`,
      kind: "video",
    };
  } catch {
    return null;
  }
}

/**
 * Playable public-domain clips.
 *
 * Over-fetches deliberately: a good number of library entries are audio-era
 * records or stills-with-captions that carry no mp4 at all, so asking for
 * exactly `count` reliably returns fewer than `count`.
 */
export async function nasaClips(queries: string[], count = 3): Promise<Clip[]> {
  try {
    const sets = await Promise.all(
      queries.map(async (q) => {
        const url =
          "https://images-api.nasa.gov/search?media_type=video" +
          `&page_size=12&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { next: { revalidate: DAY } });
        if (!res.ok) return [];
        const json = await res.json();
        return (json?.collection?.items ?? []) as any[];
      }),
    );

    // Round-robin so one query cannot own the whole wall.
    const queue: any[] = [];
    for (let round = 0; round < 12; round++) {
      for (const set of sets) if (set[round]) queue.push(set[round]);
    }

    const out: Clip[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < queue.length && out.length < count; i += 4) {
      const batch = await Promise.all(queue.slice(i, i + 4).map(resolveClip));
      for (const clip of batch) {
        if (!clip || seen.has(clip.id) || out.length >= count) continue;
        seen.add(clip.id);
        out.push(clip);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Several queries in parallel, deduped — one query returns very samey frames. */
const norm = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 44);

/**
 * A larger pool than we need, sampled per render, so the gallery is not the
 * same six frames every time. Seeded by the hour so it varies through the day
 * without changing on every request and busting the cache.
 */
/**
 * Two pools, sampled separately, so the gallery is always mostly SpaceX
 * hardware with robotics alongside — rather than drifting into generic
 * astronaut-and-mission-control stock, which is what a single shuffled pool
 * kept producing.
 *
 * NASA's library is full of SpaceX material because SpaceX flies NASA
 * missions: Crew Dragon, Falcon 9, Demo-2, the Crew-N flights, GOES launches.
 * All public domain.
 */
export const SPACEX_POOL = [
  "SpaceX Falcon 9 launch",
  "SpaceX Crew Dragon spacecraft",
  "SpaceX Falcon Heavy",
  "SpaceX Demo-2 mission",
  "SpaceX booster landing",
  "SpaceX Dragon docking station",
  "SpaceX Crew-9 rollout",
  "SpaceX static fire test",
  "Falcon 9 first stage recovery",
  "Dragon capsule splashdown",
];

export const ROBOT_POOL = [
  "Robonaut 2 humanoid robot",
  "Valkyrie humanoid robot",
  "Perseverance rover Mars",
  "Curiosity rover self portrait",
  "Canadarm robotic arm",
  "Astrobee free flying robot",
  "robotic arm satellite servicing",
  "Mars helicopter Ingenuity",
];

/**
 * Deterministic per hour so the server and the cache agree, but varied through
 * the day. Weighted 4 SpaceX to 2 robots.
 */
export function sampleQueries(n = 6): string[] {
  const hour = Math.floor(Date.now() / 3_600_000);
  let seed = hour;
  const next = (mod: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % mod;
  };
  const take = (pool: string[], count: number) => {
    const copy = [...pool];
    const out: string[] = [];
    while (out.length < count && copy.length) out.push(copy.splice(next(copy.length), 1)[0]);
    return out;
  };
  const spacex = Math.max(1, Math.ceil((n * 2) / 3));
  return [...take(SPACEX_POOL, spacex), ...take(ROBOT_POOL, n - spacex)];
}

export async function nasaGallery(
  queries: string[],
  perQuery = 3,
): Promise<Shot[]> {
  // Fetch more than needed per query, then filter — a query's first hits are
  // often several frames of the same moment.
  const sets = await Promise.all(queries.map((q) => nasaMedia(q, perQuery + 3)));

  const seenId = new Set<string>();
  const seenTitle = new Set<string>();
  const out: Shot[] = [];

  // Round-robin across queries so the grid alternates subjects instead of
  // showing three rollout photos then three portraits.
  for (let round = 0; round < perQuery + 3; round++) {
    for (const set of sets) {
      const s = set[round];
      if (!s) continue;
      const key = norm(s.title);
      if (seenId.has(s.id) || seenTitle.has(key)) continue;
      seenId.add(s.id);
      seenTitle.add(key);
      out.push({ ...s, title: s.title.replace(/\s*\.\.\.$/, "") });
    }
  }
  return out;
}

/* ----------------------------------------------------- Wikimedia Commons -- */

/**
 * Returns the file only if its licence permits reuse. The check is on the
 * machine-readable licence field, so an editorially useful but non-free file
 * is dropped rather than shipped with a hopeful caption.
 */
const FREE = new Set([
  "cc0", "pd", "public domain",
  "cc-by-1.0", "cc-by-2.0", "cc-by-2.5", "cc-by-3.0", "cc-by-4.0",
  "cc-by-sa-1.0", "cc-by-sa-2.0", "cc-by-sa-2.5", "cc-by-sa-3.0", "cc-by-sa-4.0",
]);

export async function commonsFile(
  fileName: string,
  widthPx = 800,
): Promise<Shot | null> {
  try {
    const api =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json" +
      "&origin=*&prop=imageinfo&iiprop=url|extmetadata" +
      `&iiurlwidth=${widthPx}&titles=${encodeURIComponent("File:" + fileName)}`;

    const res = await fetch(api, {
      headers: { "User-Agent": "InveXt/1.0 (editorial use; contact: hello@invext.example)" },
      next: { revalidate: DAY * 7 },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const pages = json?.query?.pages ?? {};
    const page: any = Object.values(pages)[0];
    const info = page?.imageinfo?.[0];
    if (!info) return null;

    const meta = info.extmetadata ?? {};
    const licenceShort: string =
      meta.LicenseShortName?.value ?? meta.License?.value ?? "";
    const licenceCode: string = (meta.License?.value ?? "").toLowerCase();

    if (!FREE.has(licenceCode) && !/^(cc|public domain)/i.test(licenceShort)) {
      return null; // not demonstrably free — drop it
    }

    const strip = (html?: string) =>
      html ? html.replace(/<[^>]*>/g, "").trim() : "";

    return {
      id: fileName,
      title: strip(meta.ObjectName?.value) || fileName.replace(/\.[a-z]+$/i, ""),
      src: info.thumburl ?? info.url,
      credit: strip(meta.Artist?.value) || "Wikimedia Commons contributor",
      licence: licenceShort || "Free licence",
      licenceUrl: meta.LicenseUrl?.value,
      sourceUrl: info.descriptionurl,
      kind: "image",
    };
  } catch {
    return null;
  }
}

/**
 * Editorial portraits for the "who runs these companies" section.
 *
 * These are freely licensed files, and the fetch above verifies that before
 * anything renders. Two constraints on placement, both from the licences
 * themselves rather than taste: CC-BY requires visible attribution, and it
 * requires that the credit not imply the licensor endorses this use. Commons
 * also flags personality-rights on portraits of living people.
 *
 * So: editorial context, credit visible, and never beside a performance
 * figure or a call to invest — that combination is what turns a photograph
 * into an implied endorsement.
 */
export const PORTRAIT_CANDIDATES = [
  "Elon Musk Royal Society (crop2).jpg",
  "Elon Musk Royal Society.jpg",
  "Elon Musk, 2018 (cropped).jpg",
  "Elon Musk 2015.jpg",
];

export async function leadershipPortrait(): Promise<Shot | null> {
  for (const f of PORTRAIT_CANDIDATES) {
    const shot = await commonsFile(f, 640);
    if (shot) return shot;
  }
  return null;
}

/* ============================================================
   COMMONS SEARCH
   ============================================================

   commonsFile() above resolves one known filename. That is fine for the
   leadership portrait, where we want a specific frame, but it is the wrong
   tool for filling an editorial grid: it means hard-coding two dozen exact
   Commons filenames, each of which can be renamed or deleted upstream, and
   every one that goes stale leaves a hole in the layout.

   So: search instead. `generator=search` over the File namespace returns
   candidates, imageinfo comes back in the same round trip, and the licence
   filter below is the same machine-readable check used above — a file that
   cannot be shown to be freely licensed is dropped rather than shipped with
   a hopeful caption.
*/

const UA = "InveXt/1.0 (editorial use; contact: hello@invext.example)";

function freeEnough(meta: any): boolean {
  const short: string = meta?.LicenseShortName?.value ?? "";
  const code: string = (meta?.License?.value ?? "").toLowerCase();
  if (FREE.has(code)) return true;
  return /^(cc[ -]|public domain|pd)/i.test(short);
}

const strip = (html?: string) => (html ? html.replace(/<[^>]*>/g, "").trim() : "");

/**
 * Free-licensed files matching a query, newest-relevance first.
 * `filetype:bitmap` keeps SVG diagrams and PDFs out of a photo grid.
 */
export async function commonsSearch(
  query: string,
  count = 8,
  widthPx = 1000,
): Promise<Shot[]> {
  try {
    const api =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
      "&generator=search&gsrnamespace=6" +
      `&gsrlimit=${Math.min(40, count * 4)}` +
      `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}` +
      "&prop=imageinfo&iiprop=url|extmetadata|size" +
      `&iiurlwidth=${widthPx}`;

    const res = await fetch(api, {
      headers: { "User-Agent": UA },
      next: { revalidate: DAY * 3 },
    });
    if (!res.ok) return [];

    const json = await res.json();
    const pages: any[] = Object.values(json?.query?.pages ?? {});

    return pages
      .filter((pg) => {
        const info = pg?.imageinfo?.[0];
        if (!info?.thumburl && !info?.url) return false;
        // Landscape-ish and reasonably large; portrait crops badly in a strip.
        if (info.width && info.height && info.width < 480) return false;
        return freeEnough(info.extmetadata);
      })
      .slice(0, count)
      .map((pg) => {
        const info = pg.imageinfo[0];
        const meta = info.extmetadata ?? {};
        return {
          id: String(pg.title),
          title:
            strip(meta.ObjectName?.value) ||
            String(pg.title).replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
          src: info.thumburl ?? info.url,
          credit: strip(meta.Artist?.value) || "Wikimedia Commons contributor",
          licence: strip(meta.LicenseShortName?.value) || "Free licence",
          licenceUrl: meta.LicenseUrl?.value,
          sourceUrl: info.descriptionurl,
          kind: "image" as const,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Subject queries for the editorial layer.
 *
 * Deliberately narrow. "Elon Musk" alone returns a great deal of protest
 * placard photography and meme derivatives; naming the venue or the hardware
 * gets press-conference and factory-floor frames, which is what an editorial
 * grid actually wants.
 */
export const SUBJECT_QUERIES: Record<string, string> = {
  musk: "Elon Musk portrait speaking",
  muskPress: "Elon Musk press conference",
  muskFactory: "Elon Musk factory Tesla",
  tesla: "Tesla Model S Model 3 car",
  cybertruck: "Tesla Cybertruck",
  gigafactory: "Tesla Gigafactory building",
  optimus: "Tesla Optimus humanoid robot",
  falcon: "Falcon 9 rocket launch SpaceX",
  starship: "SpaceX Starship Starbase",
  dragon: "SpaceX Dragon capsule spacecraft",
  starlink: "Starlink satellite dish antenna",
  boring: "Boring Company tunnel Las Vegas Loop",
  neuralink: "brain computer interface neurotechnology implant",
  datacentre: "data centre server racks GPU",
  nasdaq: "stock exchange trading floor screens",
};

/**
 * Resolve every subject in one pass and hand back a flat, deduplicated pool.
 * Failures are silent by design: a subject that returns nothing simply
 * contributes nothing, and the assignment step below redistributes.
 */
export async function subjectPool(
  subjects: string[],
  perSubject = 4,
): Promise<Shot[]> {
  const sets = await Promise.all(
    subjects.map((s) => commonsSearch(SUBJECT_QUERIES[s] ?? s, perSubject)),
  );

  const seen = new Set<string>();
  const out: Shot[] = [];
  // Round-robin so the pool alternates subjects rather than delivering four
  // Cybertrucks before the first rocket.
  for (let round = 0; round < perSubject; round++) {
    for (const set of sets) {
      const s = set[round];
      if (!s || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}
