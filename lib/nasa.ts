/**
 * NASA Image and Video Library — public domain, commercial use permitted.
 * Fetched server-side and cached. Returns [] on failure so the UI can fall
 * back to a designed empty state rather than a broken <img>.
 */

export interface NasaShot {
  id: string;
  title: string;
  href: string;
  center: string;
  date: string;
}

export async function nasaImages(query: string, count = 4): Promise<NasaShot[]> {
  try {
    const url =
      "https://images-api.nasa.gov/search?media_type=image&page_size=20&q=" +
      encodeURIComponent(query);
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const json = await res.json();
    const items = json?.collection?.items ?? [];
    return items
      .filter((i: any) => i?.links?.[0]?.href && i?.data?.[0])
      .slice(0, count)
      .map((i: any) => ({
        id: i.data[0].nasa_id,
        title: i.data[0].title ?? "",
        href: i.links[0].href.replace("~thumb.jpg", "~medium.jpg"),
        center: i.data[0].center ?? "NASA",
        date: (i.data[0].date_created ?? "").slice(0, 10),
      }));
  } catch {
    return [];
  }
}
