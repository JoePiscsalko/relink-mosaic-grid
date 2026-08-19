import { getStore } from "@netlify/blobs";

/* ------------------------------------------------------------------
   Marketing calendar storage.

   GET  /api/calendar            -> { entries, saves }
   GET  /api/calendar?img=<id>   -> { value }   one image, base64
   POST /api/calendar            -> writes, needs the passphrase

   Images live under their own keys rather than inside the entry list.
   A month of social posts would otherwise make every page load drag
   a megabyte of base64 down the wire whether or not anyone opened a
   card. This way the list is small and images are fetched only for
   the entries that have one.

     calendar/entries      the list
     calendar/img/<id>     one image per entry
     calendar/backup/<ts>  every write of the list, kept
     calendar/saves        write count

   Same MOSAIC_WRITE_KEY as the grid and Form Fills. Unlike those two
   this is an everyday editing surface, so the app asks for the
   passphrase once per session rather than on every change.
------------------------------------------------------------------- */

const STORE = "mosaic-grid";
const MAX_ENTRIES = 20000;
const MAX_IMAGE = 4 * 1024 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  let store;
  try {
    store = getStore(STORE);
  } catch (e) {
    return json({ error: "Blob store unavailable." }, 500);
  }

  if (req.method === "GET") {
    const img = new URL(req.url).searchParams.get("img");
    if (img) {
      try {
        const rec = await store.get(`calendar/img/${img}`, { type: "json" });
        return json({ value: rec?.value || null });
      } catch (e) {
        return json({ value: null });
      }
    }
    try {
      const [entries, saves] = await Promise.all([
        store.get("calendar/entries", { type: "json" }),
        store.get("calendar/saves", { type: "json" }),
      ]);
      return json({ entries: entries?.list || [], saves: saves?.count || 0 });
    } catch (e) {
      return json({ entries: [], saves: 0 });
    }
  }

  if (req.method === "POST") {
    const secret = process.env.MOSAIC_WRITE_KEY;
    if (!secret) return json({ error: "No write passphrase is configured on this site yet." }, 500);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Could not read the request." }, 400);
    if (body.key !== secret) return json({ error: "That passphrase doesn't match." }, 401);

    /* one image */
    if (body.img) {
      const id = String(body.img).slice(0, 80).replace(/[^A-Za-z0-9_-]/g, "");
      if (!id) return json({ error: "Bad image id." }, 400);
      try {
        if (body.value == null) {
          await store.delete(`calendar/img/${id}`);
          return json({ ok: true, deleted: id });
        }
        if (String(body.value).length > MAX_IMAGE)
          return json({ error: "That image is too large even after resizing." }, 413);
        await store.setJSON(`calendar/img/${id}`, { value: body.value });
        return json({ ok: true, id });
      } catch (e) {
        return json({ error: "The image didn't save." }, 500);
      }
    }

    /* the entry list */
    const list = Array.isArray(body.entries) ? body.entries : null;
    if (!list) return json({ error: "No entries in the payload." }, 400);
    if (list.length > MAX_ENTRIES)
      return json({ error: `That's ${list.length.toLocaleString()} entries — over the limit.` }, 413);

    const savedAt = new Date().toISOString();
    try {
      await store.setJSON("calendar/entries", { savedAt, list });
      await store.setJSON(`calendar/backup/${savedAt.slice(0, 19).replace(/[:T]/g, "-")}`, { savedAt, list });
      const prev = (await store.get("calendar/saves", { type: "json" })) || { count: 0 };
      const count = (prev.count || 0) + 1;
      await store.setJSON("calendar/saves", { count, last: savedAt });
      return json({ ok: true, savedAt, entries: list.length, saves: count });
    } catch (e) {
      return json({ error: "Saved nothing — the storage write failed." }, 500);
    }
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/calendar" };
