import { getStore } from "@netlify/blobs";

/* ------------------------------------------------------------------
   Mosaic Grid storage.

   GET  /api/data  -> { data, saves }
   POST /api/data  -> saves a dataset, needs the write passphrase

   Rows carry their own week, so there's one living dataset rather
   than a pile of weekly snapshots. Publishing replaces it and files
   a dated backup, so nothing is ever lost.

     current        what the app loads
     backup/<ts>    every publish, kept
     saves          how many times it's been published

   Set MOSAIC_WRITE_KEY in Netlify -> Site configuration ->
   Environment variables, then redeploy.
------------------------------------------------------------------- */

const STORE = "mosaic-grid";
const MAX_ROWS = 200000;

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
        store.get("current", { type: "json" }),
        store.get("saves", { type: "json" }),
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

    const rows = Array.isArray(body.rows) ? body.rows : null;
    const keywords = Array.isArray(body.keywords) ? body.keywords : [];
    if (!rows || !rows.length) return json({ error: "No campaign rows in the payload." }, 400);
    if (rows.length + keywords.length > MAX_ROWS)
      return json({ error: `That's ${(rows.length + keywords.length).toLocaleString()} rows — over the ${MAX_ROWS.toLocaleString()} limit.` }, 413);

    const record = {
      savedAt: new Date().toISOString(),
      by: String(body.by || "").slice(0, 80),
      period: String(body.period || "").slice(0, 160),
      rows,
      keywords,
    };

    try {
      await store.setJSON("current", record);
      await store.setJSON(`backup/${record.savedAt.slice(0, 19).replace(/[:T]/g, "-")}`, record);

      const prev = (await store.get("saves", { type: "json" })) || { count: 0 };
      const count = (prev.count || 0) + 1;
      await store.setJSON("saves", { count, last: record.savedAt });

      return json({ ok: true, savedAt: record.savedAt, rows: rows.length, keywords: keywords.length, saves: count });
    } catch (e) {
      return json({ error: "Saved nothing — the storage write failed." }, 500);
    }
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/data" };
