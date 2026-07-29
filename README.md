# Mosaic Grid

SBU × channel performance grid for reLink Medical. Upload weekly exports,
publish once, everyone sees the same numbers.

---

## First-time setup

**1. Create the repo**

New GitHub repo, then add these files through the web UI. Folder structure:

```
index.html
package.json
netlify.toml
vite.config.js
src/main.jsx
src/App.jsx
netlify/functions/data.js
```

To create a folder in the GitHub web UI: **Add file → Create new file**, then
type `src/App.jsx` as the filename — the slash makes the folder.

**2. Connect to Netlify**

Add new site → Import an existing project → pick the repo.
Build settings come from `netlify.toml`, so leave them alone.

**3. Set the write passphrase**

Netlify → **Site configuration → Environment variables → Add a variable**

| Key | Value |
|---|---|
| `MOSAIC_WRITE_KEY` | whatever you want the passphrase to be |

Then **Deploys → Trigger deploy → Clear cache and deploy site.**
Environment variables only take effect on the next build.

Without this variable, the grid still loads and reads fine — publishing is
refused with a clear message.

---

## The weekly routine

1. **Google Ads → Campaigns.** Set the date range. `Segment → Time → Week`.
   `Download → .csv`
2. **Google Ads → Audiences, keywords and content → Search keywords.**
   Same range. `Download → .csv`
3. **LinkedIn → Campaign Manager → Export → Campaign Performance.** CSV.
4. Open the grid → **Import CSV** → drop each file in turn.
   Campaigns first, keywords second.
5. **Publish to team**, enter the passphrase, done.

Raw exports work as-is. No editing, no adding columns.

---

## How storage works

One Netlify Blobs store, `mosaic-grid`:

| Key | What it holds |
|---|---|
| `latest` | the snapshot the app loads on open |
| `snapshot/<date>` | every week ever published, kept |
| `index` | per-week totals per cell, used to draw trends |

A full week — campaigns, all keywords, LinkedIn — is about **30 KB**.
A year of weekly saves is **1.5 MB**. This will not become a storage problem.

**Trends improve on their own.** Each publish appends a point to `index`.
After three weeks the sparklines and the ▲▼ arrows start drawing themselves
from your own history, whether or not the export had a week column. The
drawer says when a trend came from saved history rather than the file.

Re-publishing the same week replaces it rather than duplicating it, so a
mistake is fixed by importing again and publishing to the same date.

---

## Changing the grid

Everything you'd want to edit is at the top of `src/App.jsx`:

| Constant | What it controls |
|---|---|
| `SBUS` | the columns, and who owns each |
| `CHANNELS` | the rows |
| `CAMPAIGN_RULES` | campaign name → business unit |
| `TYPE_RULES` | Google campaign type → channel row |
| `SEED` | the data shown before anything is published |

`CAMPAIGN_RULES` is checked top to bottom, first match wins. Add a line and
next week's import assigns itself. Anything unmatched can also be assigned by
hand during import.

---

## If something looks wrong

**"Working from the built-in data"** — the function isn't reachable. Usually
the first deploy hasn't finished, or `netlify/functions/data.js` landed in the
wrong folder.

**"No write passphrase is configured"** — `MOSAIC_WRITE_KEY` isn't set, or the
site hasn't been rebuilt since it was added.

**Campaigns landing in the wrong column** — check `CAMPAIGN_RULES`. Order
matters; a broad rule above a specific one will swallow it.

**Numbers don't tie to the platform** — the importer drops rows with no spend,
leads, impressions or clicks, and skips the platform's own total rows. Live
campaign totals should reconcile exactly.
