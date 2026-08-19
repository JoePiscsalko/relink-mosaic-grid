import React from "react";

/* ==================================================================
   BENCHMARKS — how a cell reads against the rest of the market

   The point of this panel is that someone who does not run ads for a
   living can open a cell and know, without asking, whether the number
   in front of them is good.

   A note on which benchmarks these are. reLink sells to hospitals,
   health systems and equipment vendors — it is B2B. Most published
   "healthcare marketing" benchmarks describe clinics advertising to
   patients, which is a different auction with different economics,
   and using them here would set targets that are wrong in both
   directions. So these are B2B ranges, with healthcare and medical
   device figures used only where the comparison genuinely holds
   (email engagement, for instance, where medtech audiences behave
   like medtech audiences regardless of who is selling).

   Ranges, not targets. A range says "this is what the field looks
   like". A target says "hit this number". Only the second one is
   worth arguing about in a meeting, and it should be set by the
   business, not by an average of strangers.

   To change a number: edit BENCHMARKS below. Each metric carries the
   source it came from, which shows in the panel footnote, so nobody
   has to take these on faith.
------------------------------------------------------------------- */

const BANDS = {
  strong: { label: "Ahead of benchmark", color: "#90AD51" },
  typical: { label: "In the normal range", color: "#0598A6" },
  weak: { label: "Below benchmark", color: "#F38637" },
};

/* higher: true  -> more is better (CTR, open rate, ROAS)
   higher: false -> less is better (CPC, CPL, unsubscribe rate)
   weak / good   -> the two thresholds that split the three bands
   scale         -> how far the track runs, for drawing only        */
const BENCHMARKS = {
  google: [
    {
      key: "ctr", label: "Click-through rate", higher: true,
      weak: 2, good: 6, scale: 10, fmt: "pct",
      plain: "How often someone who sees the ad actually clicks it. Low means the ad or the keyword isn't matching what people are searching for.",
      source: "Cross-industry Google Search CTR averages 3.4–3.5% (WordStream, Terra 2026).",
    },
    {
      key: "cpc", label: "Cost per click", higher: false,
      weak: 5.5, good: 2.5, scale: 10, fmt: "money2",
      plain: "What one visit costs. Rising CPC usually means more competition, not worse ads.",
      source: "B2B $3.33, health & medical $2.62, cross-industry Search $2.96 (Ryze, DigitalApplied Q1 2026).",
    },
    {
      key: "cvr", label: "Conversion rate", higher: true,
      weak: 2, good: 5, scale: 12, fmt: "pct",
      plain: "Of the people who click, how many fill out a form. This is a landing page question more than an ad question.",
      source: "Cross-industry Google Search converts at about 4.4% (DigitalApplied 2026).",
    },
    {
      key: "cpl", label: "Cost per lead", higher: false,
      weak: 200, good: 50, scale: 300, fmt: "money0",
      plain: "What one enquiry costs. Worth judging against what a lead is worth to reLink, not only against the market.",
      source: "Healthcare search CPL sits near $57–$67; B2B lead gen commonly runs $50–$150 (PPC Chief, WordStream 2026).",
    },
    {
      key: "roas", label: "Return on ad spend", higher: true,
      weak: 2, good: 5, scale: 10, fmt: "x",
      plain: "Tracked revenue for every dollar spent. 3x means three dollars back per dollar in.",
      source: "3–5x is the common working target; Optmyzr's 2026 health & fitness cohort averaged roughly 3x.",
    },
  ],
  social: [
    {
      key: "ctr", label: "Click-through rate", higher: true,
      weak: 0.3, good: 0.9, scale: 2, fmt: "pct",
      plain: "LinkedIn click rates look alarming next to Google's. They are supposed to. Under 0.3% is the number that signals a real creative or audience problem.",
      source: "Sponsored Content averages 0.44–0.65%; below 0.3% flags creative or audience issues (Datavinity, TheSmarketers 2026).",
    },
    {
      key: "cpc", label: "Cost per click", higher: false,
      weak: 12, good: 5, scale: 20, fmt: "money2",
      plain: "LinkedIn charges a premium for reaching senior job titles. A high CPC against a genuinely senior audience is the system working.",
      source: "Cross-industry Sponsored Content CPC $5.26–$5.74; C-suite targeting can exceed $15 (DigitalApplied, DemandSense 2026).",
    },
    {
      key: "cpm", label: "Cost per 1,000 impressions", higher: false,
      weak: 100, good: 30, scale: 150, fmt: "money0",
      plain: "What it costs to be seen a thousand times. Driven mostly by how narrow the targeting is.",
      source: "Broad B2B $20–$38; narrow enterprise $38–$65; ultra-narrow $65–$120 (TheSmarketers 2026).",
    },
    {
      key: "cpl", label: "Cost per lead", higher: false,
      weak: 250, good: 75, scale: 400, fmt: "money0",
      plain: "Expensive per lead by design. LinkedIn's argument is that the leads are better qualified, which only holds if that gets checked downstream.",
      source: "B2B CPL typically $75–$150, ranging to $200 for qualified leads (Benly 2026).",
    },
  ],
  email: [
    {
      key: "open", label: "Open rate", higher: true,
      weak: 20, good: 40, scale: 60, fmt: "pct",
      plain: "How many recipients opened. Treat movement as more meaningful than the level — Apple and Gmail privacy features inflate opens unpredictably.",
      source: "All-industry ~19%; medical device B2B 25–30%; healthcare organisations reach 40%+ (WebFX, Buzzbox 2026).",
    },
    {
      key: "click", label: "Click rate", higher: true,
      weak: 1.5, good: 5, scale: 8, fmt: "pct",
      plain: "Clicks as a share of everyone sent to. This is the honest engagement number, and the one to watch instead of opens.",
      source: "All-industry 2.1–2.4%; medical device B2B 4–6% (MailerLite, WebFX, Buzzbox 2026).",
    },
    {
      key: "ctor", label: "Click-to-open rate", higher: true,
      weak: 8, good: 18, scale: 30, fmt: "pct",
      plain: "Of the people who opened, how many clicked. This isolates the content from the subject line — a weak number here means the email itself underdelivered.",
      source: "Commonly 10–15% across B2B senders (MailerLite 2026 click-to-open benchmarks).",
    },
    {
      key: "unsub", label: "Unsubscribe rate", higher: false,
      weak: 0.8, good: 0.2, scale: 1.5, fmt: "pct2",
      plain: "The cost of sending. Climbing unsubscribes usually mean frequency or relevance, not content quality.",
      source: "All-industry 0.22% in 2025, up sharply after Gmail's one-click unsubscribe (MailerLite 2026).",
    },
  ],
  display: [
    {
      key: "ctr", label: "Click-through rate", higher: true,
      weak: 0.2, good: 0.8, scale: 1.5, fmt: "pct",
      plain: "Display is seen far more than it is clicked. Judge it on reach and assisted conversions rather than on clicks alone.",
      source: "Google Display averages about 0.39% CTR (DigitalApplied 2026).",
    },
    {
      key: "cpc", label: "Cost per click", higher: false,
      weak: 3, good: 0.5, scale: 5, fmt: "money2",
      plain: "Cheap clicks, low intent. The cheapness is the point; it buys presence, not enquiries.",
      source: "Display CPC averages $0.44, roughly 85% below Search (Ryze, DigitalApplied 2026).",
    },
    {
      key: "cpl", label: "Cost per lead", higher: false,
      weak: 300, good: 100, scale: 500, fmt: "money0",
      plain: "Prospecting display rarely converts directly. Retargeting display routinely converts 2–3x better than prospecting, so a blended number hides a lot.",
      source: "Display converts at roughly 0.72% against Search's 4.4% (DigitalApplied 2026).",
    },
  ],
};

/* ---------------- metric maths ---------------- */
const safe = (n, d) => (d > 0 ? n / d : null);

function measure(key, t) {
  switch (key) {
    case "ctr":   return pctOf(safe(t.clicks, t.reach));
    case "cpc":   return safe(t.spend, t.clicks);
    case "cvr":   return pctOf(safe(t.leads, t.clicks));
    case "cpl":   return safe(t.spend, t.leads);
    case "roas":  return safe(t.revenue, t.spend);
    case "cpm":   return t.reach > 0 ? (t.spend / t.reach) * 1000 : null;
    case "open":  return pctOf(safe(t.opens, t.reach));
    case "click": return pctOf(safe(t.clicks, t.reach));
    case "ctor":  return pctOf(safe(t.clicks, t.opens));
    case "unsub": return pctOf(safe(t.unsubs, t.reach));
    default:      return null;
  }
}
const pctOf = (v) => (v === null ? null : v * 100);

/* Small numbers move a lot on their own. Say so rather than letting a
   verdict rest on four clicks. */
function thinData(key, t) {
  if (["cpl", "cvr"].includes(key) && t.leads < 10) return "only " + t.leads + " lead" + (t.leads === 1 ? "" : "s");
  if (["ctr", "cpc", "cpm", "click", "open"].includes(key) && t.reach < 1000) return "under 1,000 impressions";
  if (key === "cpc" && t.clicks < 50) return "under 50 clicks";
  if (key === "ctor" && t.opens < 100) return "under 100 opens";
  if (key === "unsub" && t.reach < 500) return "a small send";
  if (key === "roas" && t.leads < 10) return "only " + t.leads + " lead" + (t.leads === 1 ? "" : "s");
  return null;
}

const fmtVal = (v, fmt) => {
  if (v === null) return "\u2014";
  if (fmt === "pct") return (v >= 10 ? v.toFixed(0) : v.toFixed(2)) + "%";
  if (fmt === "pct2") return v.toFixed(2) + "%";
  if (fmt === "money2") return "$" + v.toFixed(2);
  if (fmt === "money0") return "$" + Math.round(v).toLocaleString();
  if (fmt === "x") return (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + "x";
  return String(v);
};
const fmtBound = (v, fmt) => fmtVal(v, fmt === "pct2" ? "pct2" : fmt);

function bandOf(v, m) {
  if (v === null) return null;
  if (m.higher) return v >= m.good ? "strong" : v >= m.weak ? "typical" : "weak";
  return v <= m.good ? "strong" : v <= m.weak ? "typical" : "weak";
}

/* ---------------- one metric row ---------------- */
function Row({ m, t }) {
  const v = measure(m.key, t);
  const band = bandOf(v, m);
  const thin = v === null ? null : thinData(m.key, t);
  const pos = (x) => Math.max(0, Math.min(100, (x / m.scale) * 100));

  /* Bands are drawn low-to-high across the track. Which end is good
     flips depending on the metric, so the colours flip with it. */
  const lo = Math.min(m.weak, m.good);
  const hi = Math.max(m.weak, m.good);
  const leftColor = m.higher ? BANDS.weak.color : BANDS.strong.color;
  const rightColor = m.higher ? BANDS.strong.color : BANDS.weak.color;

  return (
    <div className="bm-row">
      <div className="bm-row-top">
        <span className="bm-row-label">{m.label}</span>
        <span className="bm-row-value" style={{ color: band ? BANDS[band].color : "rgba(46,38,34,.35)" }}>
          {fmtVal(v, m.fmt)}
        </span>
      </div>

      {band && (
        <div className="bm-verdict">
          <span className="bm-chip" style={{ color: BANDS[band].color, borderColor: BANDS[band].color }}>
            {BANDS[band].label}
          </span>
        </div>
      )}

      <div className="bm-track" aria-hidden="true">
        <span className="bm-band" style={{ left: 0, width: `${pos(lo)}%`, background: leftColor }} />
        <span className="bm-band" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%`, background: BANDS.typical.color }} />
        <span className="bm-band" style={{ left: `${pos(hi)}%`, right: 0, background: rightColor }} />
        {v !== null && (
          <span className="bm-marker" style={{ left: `${pos(v)}%` }}>
            <i />
          </span>
        )}
      </div>

      <div className="bm-scale" aria-hidden="true">
        <span style={{ left: `${pos(lo)}%` }}>{fmtBound(lo, m.fmt)}</span>
        <span style={{ left: `${pos(hi)}%` }}>{fmtBound(hi, m.fmt)}</span>
      </div>

      <p className="bm-plain">
        {v === null ? "Not tracked for this cell. " : ""}
        {m.plain}
        {thin && <b> Based on {thin}, so read it lightly.</b>}
      </p>
    </div>
  );
}


/* ==================================================================
   SALES TOOL KIT — the one cell with no numbers in it

   The Tool Kit row has no spend and no impressions, so a benchmark
   panel would be four dashes. What is actually useful here is a way
   through to the material itself.

   The Sales Library filters by SBU in the app rather than in the URL,
   so this cannot yet open pre-filtered. Until it can, the panel names
   the tag to pick on arrival, which beats dropping someone into a
   library of a hundred cards with no bearings.

   The two apps also name their business units differently. Where the
   grid says reLink360 the library says Consignment. TOOLKIT_TAG maps
   between them and deliberately leaves the three with no counterpart
   unmapped — better a plain link than a confident wrong one.
------------------------------------------------------------------- */

const LIBRARY_URL = "https://relink-sales-play.netlify.app/";

const TOOLKIT_TAG = {
  ready:  "reLink Ready",
  trans:  "Transactional",
  r360:   "Consignment",
  netnew: "Net New",
  /* disp, mev and brand have no library tag yet — they fall through
     to a plain link rather than pointing somewhere wrong. */
};

function ToolkitPanel({ sbu }) {
  const tag = sbu ? TOOLKIT_TAG[sbu.key] : null;
  return (
    <div className="bm">
      <style>{BM_CSS}</style>
      <div className="bm-head">
        <h3 className="bm-title">Where the material lives</h3>
      </div>

      <p className="tk-lead">
        {tag
          ? <>The Sales Library holds the play and the customer-facing material for this unit. Filter to the <b>{tag}</b> tag once you are in.</>
          : <>The Sales Library holds the plays and the customer-facing material the AE team carries.</>}
      </p>

      <a className="tk-btn" href={LIBRARY_URL} target="_blank" rel="noopener noreferrer">
        Open the Sales Library &rarr;
      </a>

      <p className="bm-foot">
        Sign-in required, restricted to @relinkmedical.com addresses. Sales Play is training
        material; Sales Tool Kit is what goes to the customer. Anything marked Internal Only
        stays inside the building.
      </p>
    </div>
  );
}

/* ---------------- panel ---------------- */
export default function BenchmarkPanel({ channel, totals, sbu }) {
  if (channel?.key === "toolkit") return <ToolkitPanel sbu={sbu} />;

  const list = BENCHMARKS[channel?.key];
  if (!list || !totals) return null;

  /* Only show a metric the cell can actually answer. A row of dashes
     teaches nobody anything. */
  const rows = list.filter((m) => measure(m.key, totals) !== null);
  if (!rows.length) return null;

  return (
    <div className="bm">
      <style>{BM_CSS}</style>
      <div className="bm-head">
        <h3 className="bm-title">How this compares</h3>
        <div className="bm-key">
          <span><i style={{ background: BANDS.weak.color }} />Below</span>
          <span><i style={{ background: BANDS.typical.color }} />Normal</span>
          <span><i style={{ background: BANDS.strong.color }} />Ahead</span>
        </div>
      </div>

      {rows.map((m) => <Row key={m.key} m={m} t={totals} />)}

      <div className="bm-foot">
        <p>
          <b>Where these come from.</b> Published 2026 B2B and medical device benchmarks &mdash; not
          patient-facing healthcare figures. reLink sells to health systems and equipment vendors, so
          clinic-to-patient numbers would set the wrong bar.
        </p>
        <ul className="bm-sources">
          {rows.map((m) => (
            <li key={m.key}><b>{m.label}.</b> {m.source}</li>
          ))}
        </ul>
        <p>
          These describe the range the market sits in. They are not reLink&rsquo;s targets, and a number
          outside the range is a question worth asking rather than a verdict.
        </p>
      </div>
    </div>
  );
}

const BM_CSS = `
.bm{margin-top:30px;padding:20px 20px 16px;border:1px solid rgba(46,38,34,.14);border-radius:12px;background:#fff;box-sizing:border-box}
.bm *{box-sizing:border-box}
.bm-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding-bottom:14px;margin-bottom:4px;border-bottom:1px solid rgba(46,38,34,.1)}
.bm-title{margin:0;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(46,38,34,.5)}
.bm-key{display:flex;gap:12px}
.bm-key span{display:flex;align-items:center;gap:5px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.bm-key i{width:9px;height:9px;border-radius:2px;display:block}

.bm-row{padding:16px 0 14px;border-bottom:1px solid rgba(46,38,34,.08)}
.bm-row:last-of-type{border-bottom:none;padding-bottom:6px}
.bm-row-top{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.bm-row-label{font-size:13.5px;font-weight:600;color:#2E2622}
.bm-row-value{font-size:21px;font-weight:700;letter-spacing:-.02em;margin-left:auto}
.bm-verdict{margin-top:7px}
.bm-chip{display:inline-block;padding:3px 11px;border:1px solid;border-radius:999px;font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}

.bm-track{position:relative;height:9px;margin-top:12px;border-radius:5px;overflow:hidden;background:rgba(46,38,34,.06)}
.bm-band{position:absolute;top:0;bottom:0;opacity:.34}
.bm-marker{position:absolute;top:-3px;bottom:-3px;width:0;transform:translateX(-50%)}
.bm-marker i{position:absolute;top:0;bottom:0;left:50%;width:3px;margin-left:-1.5px;border-radius:2px;background:#2E2622;box-shadow:0 0 0 2px #fff}

.bm-scale{position:relative;height:14px;margin-top:5px}
.bm-scale span{position:absolute;transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.04em;color:rgba(46,38,34,.4);white-space:nowrap}
.bm-plain{margin:9px 0 0;font-size:12px;line-height:1.5;color:rgba(46,38,34,.55)}
.bm-plain b{font-weight:600;color:#8A4A16}
.bm-foot{margin:16px 0 0;padding-top:12px;border-top:1px solid rgba(46,38,34,.1);font-size:10.5px;line-height:1.6;color:rgba(46,38,34,.42)}
.bm-foot p{margin:0}
.bm-foot b{font-weight:600;color:rgba(46,38,34,.6)}
.bm-sources{margin:8px 0;padding:0;list-style:none}
.bm-sources li{position:relative;padding:0 0 0 12px;margin-bottom:5px;line-height:1.55}
.bm-sources li::before{content:'';position:absolute;left:0;top:7px;width:4px;height:4px;border-radius:50%;background:rgba(46,38,34,.22)}

.tk-lead{margin:16px 0 0;font-size:14px;line-height:1.6;color:rgba(46,38,34,.7)}
.tk-lead b{font-weight:700;color:#2E2622}
.tk-btn{display:inline-block;margin-top:16px;padding:10px 22px;border-radius:999px;background:#F38637;color:#fff;
  font-family:'Source Sans 3',sans-serif;font-size:13.5px;font-weight:600;text-decoration:none;transition:background .16s ease}
.tk-btn:hover{background:#e0752a}
.tk-btn:focus-visible{outline:2px solid #0598A6;outline-offset:2px}

@media print{
  .bm{break-inside:avoid;border:1px solid rgba(46,38,34,.2)}
  .tk-btn{border:1px solid rgba(46,38,34,.3);color:#2E2622;background:transparent}
  .bm-row{break-inside:avoid}
  .bm-plain{font-size:10px}
  .bm-foot{font-size:8.5px}
}
`;
