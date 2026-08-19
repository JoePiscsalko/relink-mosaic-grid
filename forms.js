import { getStore } from "@netlify/blobs";

/* ------------------------------------------------------------------
   Form Fills storage.

   GET  /api/forms  -> { data, saves }
   POST /api/forms  -> saves classified entries, needs the passphrase

   Deliberately separate from /api/data. Same blob store, different
   keys, so publishing form entries can never overwrite the grid and
   a bad form upload can never take the grid down with it.

     forms/current       what the tab loads
     forms/backup/<ts>   every publish, kept
     forms/saves         how many times it's been published

   Reuses MOSAIC_WRITE_KEY, so there's no second passphrase to set.

   Note on contact details: the app strips names, emails and messages
   before POSTing unless the person publishing ticks the box. That
   choice is made in the browser — by the time anything arrives here
   the details are already gone.
------------------------------------------------------------------- */

const STORE = "mosaic-grid";
const MAX_ENTRIES = 100000;

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
    try {
      const [data, saves] = await Promise.all([
        store.get("forms/current", { type: "json" }),
        store.get("forms/saves", { type: "json" }),
      ]);
      return json({ data: data || null, saves: saves?.count || 0 });
    } catch (e) {
      return json({ data: null, saves: 0 });
    }
  }

  if (req.method === "POST") {
    const secret = process.env.MOSAIC_WRITE_KEY;
    if (!secret) return json({ error: "No write passphrase is configured on this site yet." }, 500);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Could not read the request." }, 400);
    if (body.key !== secret) return json({ error: "That passphrase doesn't match." }, 401);

    const entries = Array.isArray(body.entries) ? body.entries : null;
    if (!entries || !entries.length) return json({ error: "No entries in the payload." }, 400);
    if (entries.length > MAX_ENTRIES)
      return json({ error: `That's ${entries.length.toLocaleString()} entries — over the ${MAX_ENTRIES.toLocaleString()} limit.` }, 413);

    const record = {
      savedAt: new Date().toISOString(),
      by: String(body.by || "").slice(0, 80),
      period: String(body.period || "").slice(0, 160),
      detail: Boolean(body.detail),
      entries,
    };

    try {
      await store.setJSON("forms/current", record);
      await store.setJSON(`forms/backup/${record.savedAt.slice(0, 19).replace(/[:T]/g, "-")}`, record);

      const prev = (await store.get("forms/saves", { type: "json" })) || { count: 0 };
      const count = (prev.count || 0) + 1;
      await store.setJSON("forms/saves", { count, last: record.savedAt });

      return json({ ok: true, savedAt: record.savedAt, entries: entries.length, saves: count });
    } catch (e) {
      return json({ error: "Saved nothing — the storage write failed." }, 500);
    }
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/forms" };
