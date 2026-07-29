import { getStore } from "@netlify/blobs";

/* ------------------------------------------------------------------
   Mosaic Grid storage.

   GET  /api/data   -> { snapshot, index }
   POST /api/data   -> saves a snapshot, needs the write passphrase

   Everything lives in one Netlify Blobs store:
     latest           the snapshot the app loads on open
     snapshot/<date>  every week kept, so history is never lost
     index            small per-week totals, used to draw trends

   The index is what makes trends work without you having to segment
   exports by week. Each save appends this week's totals; the app
   reads the last eight and draws the line itself.

   Set MOSAIC_WRITE_KEY in Netlify -> Site configuration ->
   Environment variables. Without it, saves are refused.
------------------------------------------------------------------- */

const STORE = "mosaic-grid";
const MAX_HISTORY = 104; // two years of weekly saves

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
      const [snapshot, index] = await Promise.all([
        store.get("latest", { type: "json" }),
        store.get("index", { type: "json" }),
      ]);
      return json({ snapshot: snapshot || null, index: index || [] });
    } catch (e) {
      return json({ snapshot: null, index: [] });
    }
  }

  if (req.method === "POST") {
    const secret = process.env.MOSAIC_WRITE_KEY;
    if (!secret) return json({ error: "No write passphrase is configured on this site yet." }, 500);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Could not read the request." }, 400);
    if (body.key !== secret) return json({ error: "That passphrase doesn't match." }, 401);

    const cells = body.cells;
    if (!cells || typeof cells !== "object" || !Object.keys(cells).length)
      return json({ error: "No data in the payload." }, 400);

    const date = String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const record = {
      date,
      savedAt: new Date().toISOString(),
      by: String(body.by || "").slice(0, 80),
      period: String(body.period || "").slice(0, 120),
      cells,
    };

    try {
      await store.setJSON(`snapshot/${date}`, record);
      await store.setJSON("latest", record);

      const totals = {};
      Object.entries(cells).forEach(([k, v]) => {
        if (!v || !Array.isArray(v.campaigns)) return;
        totals[k] = v.campaigns.reduce(
          (a, c) => ({ spend: a.spend + (Number(c.spend) || 0), leads: a.leads + (Number(c.leads) || 0) }),
          { spend: 0, leads: 0 }
        );
      });

      const prev = (await store.get("index", { type: "json" })) || [];
      const next = prev
        .filter((e) => e && e.date !== date)
        .concat([{ date, totals }])
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-MAX_HISTORY);
      await store.setJSON("index", next);

      return json({ ok: true, date, snapshots: next.length });
    } catch (e) {
      return json({ error: "Saved nothing — the storage write failed." }, 500);
    }
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/data" };
