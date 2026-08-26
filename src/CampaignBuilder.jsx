import React, { useState, useEffect, useMemo, useRef } from "react";

/* ==================================================================
   CAMPAIGN BUILDER

   An SBU leader says what they want to push. The app answers with a
   plan, and the plan is grounded in reLink's own numbers rather than
   in what a language model imagines a medical equipment company looks
   like.

   The order matters. Evidence is assembled first, in the browser,
   from the grid and the form fills — matched keywords with real spend
   and CPL, actual lead demand by category, campaign performance,
   email engagement for that unit. That panel is worth reading on its
   own and costs nothing. Only then is anything sent to the model, and
   what gets sent is the evidence.

   A model given "write me a campaign for imaging equipment" invents
   plausible keywords. A model given "these eleven imaging keywords
   converted at these costs last quarter, and imaging was 28 of 307
   leads" tells you where the budget should go. Same model, different
   input, completely different value.
================================================================== */

const API = "/api/campaign";

const SBUS = [
  { key: "ready",  name: "reLink Ready\u00AE", blurb: "New, refurbished, rentals, depot, PM" },
  { key: "disp",   name: "Disposition",        blurb: "Core removal and resale service" },
  { key: "r360",   name: "reLink360\u00AE",    blurb: "Full-service managed program" },
  { key: "trans",  name: "Transactional",      blurb: "One-off buys and sells" },
  { key: "netnew", name: "Net New",            blurb: "Net new reLink360 partners" },
  { key: "mev",    name: "MEV",                blurb: "Medical equipment vendors, auctions" },
  { key: "brand",  name: "Brand",              blurb: "Branded search" },
];

const GOALS = [
  { key: "leads",     label: "Generate leads",        note: "form fills and enquiries" },
  { key: "liquidate", label: "Move specific stock",   note: "units sitting in inventory" },
  { key: "partners",  label: "Win new partners",      note: "reLink360 and net new accounts" },
  { key: "awareness", label: "Build awareness",       note: "reach in a segment" },
];

const AUDIENCES = [
  "Hospitals and health systems",
  "Surgery centres and clinics",
  "Equipment vendors and resellers",
  "Biomed and clinical engineering",
  "Supply chain and purchasing",
];

/* ---------------- keyword fallback ----------------
   The 182 search keywords already sitting in App.jsx as SEED_KW.

   The builder reads keywords from whatever was last published. A
   "Replace everything" import clears them, and until someone
   re-imports a keyword report the evidence panel has nothing to work
   with — which is how you end up generating a campaign plan against
   zero performance history without noticing.

   So: published data wins, and this stands in when there is none.
   Nothing new is exposed by having it here; it is the same data, in
   the same public repo, one file over.
-------------------------------------------------- */
const KW_MATCH = ["Broad", "Exact", "Phrase"];
const KW_FALLBACK = [["ready","rent hospital equipment",2,1595,36,6375,535],["ready","medical equipment rental",2,1216,29,4775,424],["ready","medical equipment repair companies",2,1188,13,2527,216],["ready","covidien",2,1163,4,3081,282],["ready","medical equipment repair companies near me",2,1099,20,1795,208],["ready","medical rentals",2,1087,37,3643,358],["ready","medical equipment rental companies",2,988,21,3468,307],["ready","medical equipment repair services",2,828,7,1524,138],["ready","medical equipment rental near me",2,734,15,2786,232],["ready","covidien products",1,501,1,1321,145],["ready","medical equipment repair near me",2,358,3,614,71],["ready","medical equipment repair",2,347,6,888,64],["ready","midmark exam table",2,185,0,567,29],["ready","medical equipment near me rental",2,179,3,601,66],["ready","draeger medical",2,176,0,550,31],["ready","stryker stretchers",2,175,2,825,42],["ready","carl zeiss",2,160,0,576,26],["ready","olympus scopes",2,154,1,485,17],["ready","zoll defibrillators",2,151,0,355,23],["ready","karl storz",2,150,0,835,34],["ready","surgical equipment repair",2,141,4,543,35],["ready","medical rentals near me",2,138,2,779,69],["ready","used medical equipment rental near me",2,137,6,297,27],["ready","stryker bed",2,132,0,684,59],["ready","stryker hospital bed",2,121,1,745,60],["ready","carl zeiss microscopy",2,119,0,471,28],["ready","medical equipment rentals in my area",2,114,5,458,33],["ready","stryker gurney",2,109,0,568,21],["ready","ritter by midmark",2,108,0,420,22],["ready","medical equipment rental prices",2,97,5,310,27],["ready","stryker endoscopy",2,78,0,398,7],["ready","philips intellivue",2,75,0,308,11],["ready","olympus endoscopy",2,70,0,259,7],["ready","ge healthcare patient monitors",2,68,1,355,8],["ready","emergency medical equipment rental",2,67,1,148,20],["ready","karl storz endoscope",2,66,0,122,7],["ready","patient monitor repair service",2,58,2,134,15],["ready","philips heart monitor",2,54,1,93,7],["ready","carl zeiss surgical microscopes",2,53,1,140,8],["ready","infusion pump repair service",2,47,0,167,11],["ready","midmark exam chairs",2,45,0,264,12],["ready","philips cardiac monitor",2,43,0,155,15],["ready","short-term medical equipment rental",2,40,0,114,11],["ready","mindray anesthesia machine",2,40,0,81,7],["ready","affordable medical equipment rental",2,37,1,193,17],["ready","philips patient monitors",2,34,0,238,11],["ready","medical device rental near me",2,32,1,295,24],["ready","welch allyn medical equipment",2,28,0,175,11],["ready","zoll aed",2,25,1,227,9],["ready","philips ultrasound",2,22,0,193,6],["ready","ritter exam tables",2,18,0,55,5],["ready","zoll aed plus",2,17,0,36,2],["ready","storz endoscope",2,16,0,43,5],["ready","hill rom medical devices",2,16,0,13,2],["ready","used stryker stretcher for sale",2,13,0,29,3],["ready","welch allyn medical devices",2,12,0,121,5],["ready","stryker hospital beds for sale",2,11,0,45,4],["ready","medical equipment rental store near me",2,10,0,58,7],["ready","biomedical equipment repair",2,5,0,21,1],["ready","zoll aed 3",2,5,0,14,1],["ready","diagnostic imaging equipment rental",2,3,0,22,2],["ready","mindray anesthesia monitor",2,3,0,3,1],["ready","ventilator rental service",2,3,0,66,2],["ready","philips intellivue x3",2,2,0,20,1],["ready","drager apollo anesthesia machine",2,0,0,7,0],["ready","fluke multimeters",2,0,0,16,0],["ready","mindray anesthesia",2,0,0,11,0],["ready","medical device maintenance services",2,0,0,3,0],["ready","medical device repair companies",2,0,0,2,0],["ready","ECG monitor rental",2,0,0,5,0],["ready","surgical equipment rental near me",2,0,0,1,0],["ready","rental of medical equipment near me",2,0,0,17,0],["ready","medical equipment servicing companies",2,0,0,1,0],["ready","ge carescape b450",2,0,0,2,0],["ready","ge carescape b650",2,0,0,1,0],["ready","philips hospital monitor",2,0,0,2,0],["ready","philips mx40",2,0,0,12,0],["ready","philips vital signs monitor",2,0,0,10,0],["ready","philips intellivue mx40",2,0,0,8,0],["ready","philips intellivue mp30",2,0,0,1,0],["ready","baxter infusion pump",2,0,0,2,0],["ready","baxter IV systems",2,0,0,7,0],["ready","medrad medical equipment",2,0,0,9,0],["ready","draeger anesthesia",2,0,0,7,0],["ready","fluke biomedical products",2,0,0,3,0],["ready","ritter medical exam table",2,0,0,4,0],["disp","Buy Medical Devices",2,2669,44,7695,387],["disp","medical equipment disposition",0,863,7,2550,317],["disp","Used Medical Instruments",2,663,24,1744,215],["disp","ophthalmic instruments",2,515,4,3796,165],["disp","Reconditioned Medical Equipment",2,432,11,1691,176],["disp","Preowned Medical Equipment",2,342,7,1131,153],["disp","Refurbished Medical Instruments",2,323,0,775,75],["disp","Refurbished Medical Equipment",2,267,11,740,90],["disp","medical monitoring devices",2,263,2,1525,51],["disp","Used Medical Devices",2,228,1,717,93],["disp","exam tables",2,188,1,941,64],["disp","used ophthalmic equipment",2,167,0,357,57],["disp","ophthalmology equipment",2,158,0,960,53],["disp","Medical Equipment Liquidation",2,139,4,499,74],["disp","medical exam tables",2,132,1,551,45],["disp","Refurbished Medical Devices",2,118,5,339,29],["disp","ultrasound equipment",2,111,0,449,19],["disp","medical beds for sale",2,108,0,606,53],["disp","ultrasound for sale",2,94,0,705,34],["disp","vital sign monitor",2,93,1,327,15],["disp","used medical equipment near me",2,82,5,418,59],["disp","electrosurgical generator",2,81,0,840,26],["disp","Second Hand Medical Equipment",2,73,0,208,27],["disp","blood pressure machine for home",2,73,0,225,17],["disp","used hospital beds for sale",2,65,0,385,48],["disp","used hospital beds",2,57,0,241,35],["disp","used medical exam tables",2,56,0,118,17],["disp","ophthalmic equipment for sale",2,54,0,382,18],["disp","used endoscopy equipment",2,50,0,70,16],["disp","electrosurgical devices",2,48,0,252,12],["disp","medical table",2,47,0,218,8],["disp","used exam tables",2,41,0,199,22],["disp","Second Hand Medical Instruments",2,40,0,205,22],["disp","hospital beds",2,38,0,379,17],["disp","blood pressure monitors",2,35,0,203,9],["disp","patient monitoring devices",2,34,0,63,3],["disp","we buy medical equipment",2,33,9,253,30],["disp","exam chairs",2,33,0,252,12],["disp","Affordable Medical Equipment",2,29,1,217,25],["disp","home bp monitor",2,27,0,55,4],["disp","used ultrasound machine for sale",2,27,1,76,9],["disp","used anesthesia machines",2,26,0,51,10],["disp","centurion service",2,23,0,105,5],["disp","anesthesia machine",2,23,0,78,5],["disp","hospital beds for sale",2,21,0,132,10],["disp","endoscopy equipment",2,21,0,234,5],["disp","refurbished ultrasound machine",2,19,0,28,5],["disp","anesthesia machine for sale",2,18,0,176,4],["disp","used ultrasound machine",2,17,0,67,8],["disp","patient monitor",2,15,0,69,3],["disp","used hospital beds for sale near me",2,14,0,87,14],["disp","ultrasound machine",2,13,0,40,5],["disp","electrosurgical unit",2,13,0,181,4],["disp","ophthalmic equipment",2,8,0,73,3],["disp","medical bed",2,8,0,100,3],["disp","rigid endoscope",2,5,0,80,2],["disp","smoke evacuation",2,5,0,42,1],["disp","hospital strecher",2,4,0,47,3],["disp","hospital beds for sale near me",2,4,0,54,4],["disp","Second Hand Medical Devices",2,3,0,19,3],["disp","operating table",2,2,0,50,2],["disp","portable blood pressure monitor",2,1,0,2,1],["disp","refurbished anesthesia machines",2,1,0,10,1],["disp","buy ultrasound machine",2,1,0,2,1],["disp","phacoemulsifier",2,0,0,2,0],["disp","portable ultrasound machine for sale",2,0,0,1,0],["disp","at home ultrasound machine",2,0,0,1,0],["disp","ultrasound machine for sale",2,0,0,21,0],["disp","portable ultrasound machine",2,0,0,1,0],["disp","bulk medical supplies",2,0,0,3,0],["disp","exam bed",2,0,0,2,0],["disp","patient bed",2,0,0,17,0],["disp","patient monitoring system",2,0,0,3,0],["disp","medical monitor",2,0,0,5,0],["disp","medical endoscopes",2,0,0,1,0],["disp","operating microscope",2,0,0,1,0],["disp","endoscopy camera",2,0,0,2,0],["disp","used microscope",2,0,0,1,0],["disp","stretcher chair",2,0,0,3,0],["disp","chair medical",2,0,0,16,0],["disp","medical chair",2,0,0,1,0],["disp","medical exam chair",2,0,0,10,0],["disp","electro surgical unit",2,0,0,2,0],["disp","Preowned Medical Devices",2,0,0,5,0],["disp","Wholesale Medical Devices",2,0,0,4,0],["disp","trimedx",2,0,0,52,0],["brand","ReLink Medical",2,1346,341,3010,1212],["brand","Relink Online",2,119,40,335,201],["mev","used hospital equipment",2,640,0,3725,411],["mev","medical equipment auction",2,368,32,1304,243],["mev","used medical supplies",2,81,0,891,51],["mev","medical supply auction",2,46,2,159,30],["mev","dental equipment auctions",2,23,0,85,15],["mev","medical device auction",2,16,0,31,10],["mev","used dental equipment",2,8,0,88,5],["mev","hospital equipment auctions",2,3,0,19,2]].map(
  (r) => ({ s: r[0], ch: "google", week: null, text: r[1], match: KW_MATCH[r[2]], spend: r[3], leads: r[4], reach: r[5], clicks: r[6] })
);

/* ---------------- passphrase, held for the session ---------------- */
let writeKey = "";
try { writeKey = sessionStorage.getItem("mc:key") || ""; } catch (e) { /* private mode */ }
function askKey(reason) {
  const k = window.prompt(reason || "Write passphrase (same one the grid uses):", "");
  if (!k) return null;
  writeKey = k;
  try { sessionStorage.setItem("mc:key", k); } catch (e) { /* ask again next reload */ }
  return k;
}
function forgetKey() {
  writeKey = "";
  try { sessionStorage.removeItem("mc:key"); } catch (e) { /* nothing to do */ }
}

/* ---------------- money and rates ---------------- */
const money0 = (n) => "$" + Math.round(n).toLocaleString();
const money2 = (n) => "$" + n.toFixed(2);
const cpl = (spend, leads) => (leads > 0 && spend > 0 ? spend / leads : null);

/* ---------------- evidence ---------------- */
/* Everything here is computed locally. Nothing leaves the browser
   until Generate is pressed. */
function buildEvidence({ grid, forms, sbu, focus, category }) {
  /* Words that appear in almost every record here carry no signal. Left in,
     "equipment" alone matched 254 of 307 leads and presented that as demand
     evidence for one product line. */
  const STOP = new Set([
    "with","from","that","this","have","need","want","more","promote","focus","looking","some","just",
    "equipment","equipments","medical","device","devices","machine","machines","system","systems",
    "unit","units","product","products","item","items","hospital","hospitals","health","healthcare",
    "care","gear","stock","supply","supplies","asset","assets",
  ]);
  const terms = String(focus || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  const cat = String(category || "").toLowerCase();

  const hits = (text) => {
    const v = String(text || "").toLowerCase();
    if (cat && v.includes(cat)) return true;
    return terms.some((t) => v.includes(t));
  };

  const kwSource = (grid?.keywords || []).length ? grid.keywords : KW_FALLBACK;
  const kwAll = kwSource.filter((k) => k.s === sbu);
  const kwMatched = kwAll.filter((k) => hits(k.text));
  const kwPool = kwMatched.length ? kwMatched : kwAll;

  const converting = kwPool.filter((k) => k.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 15);
  const dead = kwPool.filter((k) => !k.leads && k.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 15);

  const rows = (grid?.rows || []).filter((r) => r.s === sbu);
  const byChannel = {};
  rows.forEach((r) => {
    const c = (byChannel[r.ch] = byChannel[r.ch] || { spend: 0, leads: 0, reach: 0, clicks: 0, opens: 0, revenue: 0, names: new Set() });
    c.spend += r.spend; c.leads += r.leads; c.reach += r.reach; c.clicks += r.clicks;
    c.opens += r.opens || 0; c.revenue += r.revenue || 0;
    if (r.name) c.names.add(r.name);
  });

  const leads = (forms || []).filter((e) => e.klass === "lead");
  const catLeads = leads.filter((e) => hits(e.cat) || hits(e.path));
  const demandPool = catLeads.length ? catLeads : leads;
  const tally = (list, fn) => {
    const m = {};
    list.forEach((e) => { const k = fn(e) || "Not recorded"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  };

  return {
    terms,
    matchedByTerm: kwMatched.length > 0,
    keywordsSearched: kwAll.length,
    converting, dead,
    byChannel,
    totalLeads: leads.length,
    focusLeads: catLeads.length,
    focusChannels: tally(demandPool, (e) => e.channel),
    focusCats: tally(demandPool, (e) => e.cat),
    focusPaths: tally(demandPool, (e) => e.path),
    usedAllLeads: catLeads.length === 0,
  };
}

const CH_NAME = { google: "Google Ads", social: "Paid Social", email: "Email", display: "Display Ads", toolkit: "Sales Tool Kit" };

function evidenceToText(ev, form, sbuName) {
  const L = [];
  L.push(`# Campaign brief`);
  L.push(``);
  L.push(`Business unit: ${sbuName}`);
  L.push(`Focus: ${form.focus}`);
  if (form.category) L.push(`Equipment category: ${form.category}`);
  L.push(`Goal: ${GOALS.find((g) => g.key === form.goal)?.label || form.goal}`);
  L.push(`Audience: ${form.audiences.join(", ") || "not specified"}`);
  if (form.timeframe) L.push(`Timeframe: ${form.timeframe}`);
  if (form.budget) L.push(`Budget: ${form.budget}`);
  if (form.channels.length) L.push(`Channels wanted: ${form.channels.join(", ")}`);
  if (form.notes) L.push(`Extra context from the SBU leader: ${form.notes}`);
  L.push(``);
  L.push(`# Performance evidence`);
  L.push(``);
  L.push(ev.matchedByTerm
    ? `The keyword figures below matched the focus terms directly.`
    : `Nothing in the keyword data matched the focus terms, so these are the whole unit's keywords for context. Say so in your answer — it means this is a new area rather than an existing one.`);
  L.push(``);

  if (ev.converting.length) {
    L.push(`## Keywords with conversions (${sbuName})`);
    L.push(`| Keyword | Match | Spend | Conversions | CPL | Impressions | Clicks |`);
    L.push(`|---|---|---|---|---|---|---|`);
    ev.converting.forEach((k) => {
      const c = cpl(k.spend, k.leads);
      L.push(`| ${k.text} | ${k.match || "?"} | ${money0(k.spend)} | ${k.leads} | ${c ? money0(c) : "\u2014"} | ${Math.round(k.reach).toLocaleString()} | ${Math.round(k.clicks).toLocaleString()} |`);
    });
    L.push(``);
  } else {
    L.push(`## Keywords with conversions`);
    L.push(`None in the data for this unit. Treat every keyword you propose as a hypothesis.`);
    L.push(``);
  }

  if (ev.dead.length) {
    const total = ev.dead.reduce((a, k) => a + k.spend, 0);
    L.push(`## Keywords spending with no conversions (${money0(total)} across ${ev.dead.length})`);
    ev.dead.forEach((k) => L.push(`- ${k.text} — ${money0(k.spend)}, ${Math.round(k.clicks)} clicks, no conversions`));
    L.push(``);
  }

  const chs = Object.entries(ev.byChannel).filter(([, c]) => c.spend || c.reach);
  if (chs.length) {
    L.push(`## Channel performance for ${sbuName}`);
    chs.forEach(([key, c]) => {
      const bits = [];
      if (c.spend) bits.push(`spend ${money0(c.spend)}`);
      if (c.leads) bits.push(`${c.leads} conversions`);
      const x = cpl(c.spend, c.leads);
      if (x) bits.push(`CPL ${money0(x)}`);
      if (c.reach) bits.push(`${Math.round(c.reach).toLocaleString()} ${key === "email" ? "sends" : "impressions"}`);
      if (c.clicks && c.reach) bits.push(`CTR ${((c.clicks / c.reach) * 100).toFixed(2)}%`);
      if (c.opens && c.reach) bits.push(`open rate ${((c.opens / c.reach) * 100).toFixed(1)}%`);
      if (c.revenue && c.spend) bits.push(`ROAS ${(c.revenue / c.spend).toFixed(1)}x`);
      L.push(`- ${CH_NAME[key] || key}: ${bits.join(", ")}`);
      const names = [...c.names].slice(0, 6);
      if (names.length) L.push(`  - running: ${names.join("; ")}`);
    });
    L.push(``);
  }

  L.push(`## Inbound demand, from the contact wizard`);
  if (ev.usedAllLeads) {
    L.push(`No leads matched the focus terms. Across all units there were ${ev.totalLeads} genuine leads in the loaded period, broken down below for context. The absence of matching demand is itself worth saying.`);
  } else {
    L.push(`${ev.focusLeads} of ${ev.totalLeads} genuine leads related to this focus.`);
  }
  if (ev.focusChannels.length) L.push(`- Channels: ${ev.focusChannels.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  if (ev.focusCats.length) L.push(`- Categories asked for: ${ev.focusCats.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  if (ev.focusPaths.length) L.push(`- Request types: ${ev.focusPaths.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  L.push(``);
  L.push(`Write the plan. Use these figures exactly; do not round them into different numbers and do not add figures that are not here.`);
  return L.join("\n");
}

/* ---------------- a small markdown renderer ---------------- */
/* Enough for headings, tables, lists, bold and fenced code. Streaming
   text through a full parser is more machinery than this needs. */
function inline(s) {
  const parts = [];
  let last = 0;
  const rx = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let m;
  while ((m = rx.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    if (m[1]) parts.push(<b key={m.index}>{m[1]}</b>);
    else parts.push(<code key={m.index} className="cb-code">{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

function Markdown({ text }) {
  const blocks = [];
  const lines = text.split("\n");
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { body.push(lines[i]); i++; }
      i++;
      const code = body.join("\n");
      blocks.push(
        <div className="cb-block" key={k++}>
          <div className="cb-block-head">
            <span>{lang || "code"}</span>
            <button className="cb-mini" onClick={() => navigator.clipboard?.writeText(code)}>Copy</button>
          </div>
          <pre className="cb-pre">{code}</pre>
        </div>
      );
      continue;
    }

    if (/^\|.*\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || "")) {
      const cells = (l) => l.split("|").slice(1, -1).map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|.*\|/.test(lines[i])) { body.push(cells(lines[i])); i++; }
      blocks.push(
        <div className="cb-tablewrap" key={k++}>
          <table className="cb-table">
            <thead><tr>{head.map((h, n) => <th key={n}>{inline(h)}</th>)}</tr></thead>
            <tbody>{body.map((r, n) => <tr key={n}>{r.map((c, m2) => <td key={m2}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const Tag = level <= 2 ? "h3" : "h4";
      blocks.push(<Tag className={level <= 2 ? "cb-h3" : "cb-h4"} key={k++}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push({ depth: (lines[i].match(/^\s*/)[0].length >= 2 ? 1 : 0), text: lines[i].replace(/^\s*[-*]\s+/, "") });
        i++;
      }
      blocks.push(<ul className="cb-ul" key={k++}>{items.map((it, n) => <li key={n} className={it.depth ? "is-sub" : ""}>{inline(it.text)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      blocks.push(<ol className="cb-ol" key={k++}>{items.map((it, n) => <li key={n}>{inline(it)}</li>)}</ol>);
      continue;
    }

    if (line.startsWith(">")) {
      blocks.push(<p className="cb-quote" key={k++}>{inline(line.replace(/^>\s?/, ""))}</p>);
      i++;
      continue;
    }

    if (!line.trim()) { i++; continue; }

    /* Consume at least this line, always. While text is streaming in, a
       table's first row arrives before its separator does — the table
       branch rejects it, and a line starting with "|" is rejected here
       too. Without a guaranteed step the loop never advances and the
       tab locks up mid-generation. */
    const para = [lines[i]];
    i++;
    while (i < lines.length && lines[i].trim() && !/^[#>|`]/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    blocks.push(<p className="cb-p" key={k++}>{inline(para.join(" "))}</p>);
  }

  return <>{blocks}</>;
}


/* ---------------- the campaign pack ----------------
   A markdown file is a working note. What an SBU leader needs is
   something they can open, read, hand to someone, and print to PDF —
   with the emails actually rendered rather than shown as source.

   So the pack is one self-contained HTML file: the plan typeset, the
   LinkedIn captions in copy blocks, and every email both previewed in
   an iframe and available as source. No dependencies, no server. It
   opens in a browser and prints clean.
-------------------------------------------------- */
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Pull the emails out, keeping the label line that precedes each. */
function extractEmails(md) {
  const out = [];
  const rx = /```html\s*([\s\S]*?)```/gi;
  let m;
  while ((m = rx.exec(md))) {
    const before = md.slice(0, m.index).split("\n").filter((l) => l.trim()).slice(-4);
    const label = before.reverse().find((l) => /^\*\*Email\s/i.test(l.trim()));
    out.push({
      html: m[1].trim(),
      label: label ? label.replace(/\*\*/g, "").trim() : `Email ${out.length + 1}`,
    });
  }
  return out;
}

/* Minimal markdown to HTML, matching what the on-screen renderer
   handles. Fenced html blocks are dropped here — they come back as
   rendered previews further down the document. */
function mdToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  const inl = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { body.push(lines[i]); i++; }
      i++;
      if (!/^html$/i.test(lang)) out.push(`<pre class="code">${esc(body.join("\n"))}</pre>`);
      continue;
    }

    if (/^\|.*\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || "")) {
      const cells = (l) => l.split("|").slice(1, -1).map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(`<table><thead><tr>${head.map((h) => `<th>${inl(h)}</th>`).join("")}</tr></thead><tbody>${
        rows.map((r) => `<tr>${r.map((c) => `<td>${inl(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push(`<h${Math.min(h[1].length + 1, 4)}>${inl(h[2])}</h${Math.min(h[1].length + 1, 4)}>`); i++; continue; }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      out.push(`<ul>${items.map((t) => `<li>${inl(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      out.push(`<ol>${items.map((t) => `<li>${inl(t)}</li>`).join("")}</ol>`);
      continue;
    }
    if (line.startsWith(">")) { out.push(`<blockquote>${inl(line.replace(/^>\s?/, ""))}</blockquote>`); i++; continue; }
    if (!line.trim()) { i++; continue; }

    const para = [lines[i]];
    i++;
    while (i < lines.length && lines[i].trim() && !/^[#>|`]/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${inl(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

function buildPack({ md, form, sbuName, ev }) {
  const emails = extractEmails(md);
  const when = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const emailSections = emails.map((e, n) => `
    <section class="email" id="email-${n + 1}">
      <div class="email-head">
        <h3>${esc(e.label)}</h3>
        <div class="email-btns">
          <button onclick="copyEmail(${n})">Copy HTML</button>
          <button onclick="downloadEmail(${n})">Download .html</button>
        </div>
      </div>
      <div class="email-frame"><iframe srcdoc="${esc(e.html)}" title="${esc(e.label)}"></iframe></div>
      <details><summary>View source</summary><pre class="code" id="src-${n}">${esc(e.html)}</pre></details>
    </section>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(form.focus)} — campaign pack</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
:root{--esp:#2E2622;--cream:#FAF7F1;--orange:#F38637;--teal:#0598A6;--olive:#90AD51;--line:rgba(46,38,34,.14)}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--esp);font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:860px;margin:0 auto;padding:48px 32px 80px}
.cover{padding-bottom:26px;margin-bottom:34px;border-bottom:3px solid var(--orange)}
.eyebrow{margin:0 0 10px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--teal)}
h1{margin:0;font-size:40px;font-weight:300;letter-spacing:-.028em;line-height:1.05}
h1 b{font-weight:700;color:var(--orange)}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.meta span{padding:5px 13px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:12px}
.meta span i{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:rgba(46,38,34,.4);margin-right:7px}
h2{margin:38px 0 12px;font-size:12px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:var(--teal);padding-bottom:8px;border-bottom:1px solid var(--line)}
h3{margin:26px 0 9px;font-size:17px;font-weight:700;letter-spacing:-.015em}
h4{margin:20px 0 7px;font-size:14px;font-weight:700}
p{margin:0 0 12px;font-size:15px;line-height:1.68}
ul,ol{margin:0 0 14px;padding-left:22px}
li{margin-bottom:6px;font-size:14.5px;line-height:1.6}
blockquote{margin:0 0 14px;padding:11px 16px;border-left:3px solid var(--orange);background:rgba(243,134,55,.08);border-radius:0 8px 8px 0;font-size:14px}
code{font-family:'IBM Plex Mono',monospace;font-size:12.5px;background:rgba(46,38,34,.07);padding:2px 5px;border-radius:4px}
pre.code{margin:0;padding:14px;background:#fff;border:1px solid var(--line);border-radius:9px;overflow:auto;max-height:400px;
  font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
table{width:100%;border-collapse:collapse;margin:0 0 18px;font-size:13.5px;background:#fff}
th{text-align:left;padding:9px 12px;font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;
  color:rgba(46,38,34,.45);border-bottom:2px solid var(--line);white-space:nowrap}
td{padding:10px 12px;border-bottom:1px solid rgba(46,38,34,.09);vertical-align:top;line-height:1.5}
td:first-child{font-weight:600}
.evidence{padding:18px 20px;margin-bottom:8px;border:1px solid var(--line);border-radius:12px;background:#fff}
.evidence h2{margin-top:0}
.ev-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.ev-grid div{padding:12px 13px;border:1px solid var(--line);border-radius:10px}
.ev-grid span{display:block;font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(46,38,34,.42)}
.ev-grid b{display:block;margin-top:6px;font-size:21px;letter-spacing:-.03em}
.email{margin:22px 0 30px;border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden}
.email-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:13px 16px;border-bottom:1px solid var(--line);background:rgba(46,38,34,.03)}
.email-head h3{margin:0;font-size:14.5px}
.email-btns{display:flex;gap:6px}
button{padding:6px 14px;border:1px solid var(--line);border-radius:999px;background:#fff;font-family:inherit;font-size:12px;font-weight:600;color:rgba(46,38,34,.7);cursor:pointer}
button:hover{border-color:var(--esp);color:var(--esp)}
.email-frame{padding:18px;background:#F2EEE6}
iframe{width:100%;height:640px;border:1px solid var(--line);border-radius:8px;background:#fff}
details{padding:12px 16px;border-top:1px solid var(--line)}
summary{cursor:pointer;font-size:12.5px;font-weight:600;color:rgba(46,38,34,.55)}
details pre{margin-top:11px}
.foot{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);font-family:'IBM Plex Mono',monospace;font-size:9px;
  letter-spacing:.1em;text-transform:uppercase;line-height:1.8;color:rgba(46,38,34,.4)}
@media print{
  @page{size:letter portrait;margin:.55in}
  body{background:#fff}
  .wrap{max-width:none;padding:0}
  .email-btns,summary{display:none}
  details{display:none}
  .email,section,table,iframe{break-inside:avoid}
  iframe{height:560px}
}
</style></head>
<body><div class="wrap">

<div class="cover">
  <p class="eyebrow">reLink Medical &middot; campaign pack</p>
  <h1>${esc(form.focus)}<b>.</b></h1>
  <div class="meta">
    <span><i>Unit</i>${esc(sbuName)}</span>
    <span><i>Goal</i>${esc((form.goal || "").replace(/^\w/, (c) => c.toUpperCase()))}</span>
    ${form.timeframe ? `<span><i>Timeframe</i>${esc(form.timeframe)}</span>` : ""}
    ${form.budget ? `<span><i>Budget</i>${esc(form.budget)}</span>` : ""}
    ${form.audiences.length ? `<span><i>Audience</i>${esc(form.audiences.join(", "))}</span>` : ""}
    <span><i>Prepared</i>${esc(when)}</span>
    ${form.by ? `<span><i>By</i>${esc(form.by)}</span>` : ""}
  </div>
</div>

<div class="evidence">
  <h2>What the data said going in</h2>
  <div class="ev-grid">
    <div><span>Matching leads</span><b>${ev.usedAllLeads ? 0 : ev.focusLeads}</b></div>
    <div><span>Converting keywords</span><b>${ev.converting.length}</b></div>
    <div><span>Spend, no conversions</span><b>${ev.dead.length ? money0(ev.dead.reduce((a, k) => a + k.spend, 0)) : "\u2014"}</b></div>
    <div><span>Live channels</span><b>${Object.keys(ev.byChannel).length}</b></div>
  </div>
</div>

${mdToHtml(md)}

${emails.length ? `<h2>Emails, rendered</h2>${emailSections}` : ""}

<p class="foot">
  reLink Medical &middot; Twinsburg, Ohio &middot; prepared ${esc(when)}<br/>
  Figures come from reLink's own campaign, keyword and contact wizard data. Strategy, copy and
  creative are proposals and should be reviewed before anything goes live.
</p>
</div>
<script>
var EMAILS = ${JSON.stringify(emails.map((e) => e.html))};
var LABELS = ${JSON.stringify(emails.map((e) => e.label))};
function copyEmail(n){navigator.clipboard.writeText(EMAILS[n]).then(function(){alert('Email HTML copied.');});}
function downloadEmail(n){
  var b=new Blob([EMAILS[n]],{type:'text/html;charset=utf-8'});
  var u=URL.createObjectURL(b),a=document.createElement('a');
  a.href=u;a.download=LABELS[n].toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.html';
  document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},1000);
}
</script>
</body></html>`;
}

/* ---------------- evidence panel ---------------- */
function EvidencePanel({ ev, sbuName }) {
  if (!ev) return null;
  const chs = Object.entries(ev.byChannel).filter(([, c]) => c.spend || c.reach);
  const deadTotal = ev.dead.reduce((a, k) => a + k.spend, 0);

  return (
    <div className="cb-ev">
      <div className="cb-ev-head">
        <h3 className="cb-h3">What the data already says</h3>
        <span className="cb-ev-note">
          {ev.terms.length
            ? <>matching on <b>{ev.terms.join(", ")}</b></>
            : "no distinctive words yet — type a focus"}
        </span>
      </div>

      {!ev.matchedByTerm && ev.keywordsSearched > 0 && (
        <p className="cb-flag">
          Nothing in {sbuName}&rsquo;s keyword history matches those words. That usually means a new
          area rather than a problem &mdash; but it does mean everything below is context, not precedent.
        </p>
      )}
      {ev.keywordsSearched === 0 && (
        <p className="cb-flag">
          No keyword data loaded for {sbuName}. Import a Google Ads search keyword report on the grid
          tab and this gets considerably sharper.
        </p>
      )}

      <div className="cb-stats">
        <div><span>Matching leads</span><b>{ev.usedAllLeads ? "0" : ev.focusLeads}</b><i>of {ev.totalLeads} genuine</i></div>
        <div><span>Converting keywords</span><b>{ev.converting.length}</b><i>with history</i></div>
        <div><span>Wasted spend</span><b>{deadTotal ? money0(deadTotal) : "\u2014"}</b><i>{ev.dead.length} keywords, no conv.</i></div>
        <div><span>Live channels</span><b>{chs.length}</b><i>for this unit</i></div>
      </div>

      {ev.converting.length > 0 && (
        <>
          <h4 className="cb-h4">Already converting</h4>
          <div className="cb-tablewrap">
            <table className="cb-table">
              <thead><tr><th>Keyword</th><th>Spend</th><th>Conv</th><th>CPL</th></tr></thead>
              <tbody>
                {ev.converting.slice(0, 8).map((k) => {
                  const c = cpl(k.spend, k.leads);
                  return (
                    <tr key={k.text}>
                      <td>{k.text}</td>
                      <td>{money0(k.spend)}</td>
                      <td>{k.leads}</td>
                      <td>{c ? money0(c) : "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ev.focusChannels.length > 0 && (
        <>
          <h4 className="cb-h4">{ev.usedAllLeads ? "Where leads come from overall" : "Where this demand comes from"}</h4>
          <div className="cb-chips">
            {ev.focusChannels.map(([k, v]) => <span className="cb-chip" key={k}>{k}<i>{v}</i></span>)}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- main ---------------- */
export default function CampaignBuilder() {
  const [grid, setGrid] = useState(null);
  const [forms, setForms] = useState(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    sbu: "disp", focus: "", category: "", goal: "leads",
    audiences: ["Hospitals and health systems"], timeframe: "", budget: "",
    channels: ["SEO", "Google Ads", "LinkedIn", "Email"], notes: "", by: "",
  });

  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState(0);
  const abortRef = useRef(null);
  const outRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/data").then((r) => r.json()).catch(() => null),
      fetch("/api/forms").then((r) => r.json()).catch(() => null),
    ]).then(([d, f]) => {
      setGrid(d?.data || null);
      setForms(f?.data?.entries || null);
      setLoading(false);
    });
  }, []);

  const sbuName = SBUS.find((s) => s.key === form.sbu)?.name || form.sbu;

  const ev = useMemo(() => {
    if (loading) return null;
    return buildEvidence({ grid, forms, sbu: form.sbu, focus: form.focus, category: form.category });
  }, [grid, forms, form.sbu, form.focus, form.category, loading]);

  const toggleIn = (field, value) =>
    setForm((f) => ({ ...f, [field]: f[field].includes(value) ? f[field].filter((x) => x !== value) : [...f[field], value] }));

  /* Five passes, not one. A Netlify function is killed at 60 seconds and a
     whole campaign takes minutes to write, so it is written in sections and
     stitched together here. Each pass is handed everything written so far. */
  const STAGE_LABELS = ["the idea", "the offer and channel plan", "the copy", "keywords and landing page", "the emails"];

  const runStage = async (n, prior, key, ctrl) => {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        key, stage: n, prior, by: form.by, focus: form.focus,
        brief: evidenceToText(ev, form, sbuName),
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const err = new Error(j.error || `Stage ${n} didn't come back.`);
      err.status = res.status;
      throw err;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      text += chunk;
      setOut((p) => p + chunk);
      if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
    }
    return text;
  };

  const generate = async (retry = true) => {
    if (!form.focus.trim()) { setError("Say what you want to promote first."); return; }
    const key = writeKey || askKey();
    if (!key) return;

    setError(null); setBusy(true); setOut(""); setStage(1);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let assembled = "";
    try {
      for (let n = 1; n <= 5; n++) {
        setStage(n);
        if (n > 1) { setOut((p) => p + "\n\n"); assembled += "\n\n"; }
        const text = await runStage(n, assembled, key, ctrl);
        assembled += text;
      }
      setStage(0);
    } catch (e) {
      if (e.name === "AbortError") { setBusy(false); setStage(0); return; }
      if (e.status === 401 && retry) {
        forgetKey(); setBusy(false); setStage(0);
        if (askKey("That passphrase didn't match. Try again:")) return generate(false);
        return;
      }
      setError(
        assembled
          ? `${e.message || "That didn't work."} The sections written before it are still below.`
          : (e.message || "That didn't work.")
      );
      setStage(0);
    }
    setBusy(false);
  };

  const stop = () => { abortRef.current?.abort(); setBusy(false); };

  const download = (name, text, type = "text/markdown;charset=utf-8") => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const emails = useMemo(() => extractEmails(out), [out]);

  const slug = (form.focus || "campaign").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  return (
    <>
      <style>{CB_CSS}</style>
      <div className="cb-root">
        <header className="cb-head">
          <div>
            <p className="cb-eyebrow">reLink &middot; campaign builder</p>
            <h1 className="cb-title">Campaign <span>Builder</span></h1>
            <p className="cb-sub">
              Say what the unit wants to push. The plan comes back grounded in reLink&rsquo;s own
              keyword, campaign and lead data &mdash; not in guesses about the market.
            </p>
          </div>
        </header>

        <div className="cb-grid">
          <div className="cb-form">
            <h3 className="cb-h3">The brief</h3>

            <label className="cb-field">
              <span>Business unit</span>
              <select value={form.sbu} onChange={(e) => setForm({ ...form, sbu: e.target.value })}>
                {SBUS.map((s) => <option key={s.key} value={s.key}>{s.name} — {s.blurb}</option>)}
              </select>
            </label>

            <label className="cb-field">
              <span>What do you want to promote?</span>
              <input type="text" value={form.focus} placeholder="e.g. refurbished infusion pumps we have in depot"
                onChange={(e) => setForm({ ...form, focus: e.target.value })} />
            </label>

            <label className="cb-field">
              <span>Equipment category <i>optional</i></span>
              <input type="text" value={form.category} placeholder="e.g. Imaging, Biomed / Patient care"
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>

            <label className="cb-field">
              <span>Goal</span>
              <select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
                {GOALS.map((g) => <option key={g.key} value={g.key}>{g.label} — {g.note}</option>)}
              </select>
            </label>

            <div className="cb-field">
              <span>Who it&rsquo;s for</span>
              <div className="cb-pills">
                {AUDIENCES.map((a) => (
                  <button key={a} className={"cb-pill" + (form.audiences.includes(a) ? " is-on" : "")}
                    onClick={() => toggleIn("audiences", a)}>{a}</button>
                ))}
              </div>
            </div>

            <div className="cb-field">
              <span>Channels</span>
              <div className="cb-pills">
                {["SEO", "Google Ads", "LinkedIn", "Email", "Display"].map((c) => (
                  <button key={c} className={"cb-pill" + (form.channels.includes(c) ? " is-on" : "")}
                    onClick={() => toggleIn("channels", c)}>{c}</button>
                ))}
              </div>
            </div>

            <div className="cb-row">
              <label className="cb-field">
                <span>Timeframe <i>optional</i></span>
                <input type="text" value={form.timeframe} placeholder="e.g. 6 weeks from Sept 1"
                  onChange={(e) => setForm({ ...form, timeframe: e.target.value })} />
              </label>
              <label className="cb-field">
                <span>Budget <i>optional</i></span>
                <input type="text" value={form.budget} placeholder="e.g. $4k"
                  onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              </label>
            </div>

            <label className="cb-field">
              <span>Anything else the plan should know <i>optional</i></span>
              <textarea rows={3} value={form.notes} placeholder="Stock levels, competitors, a date it has to land by, what didn't work last time"
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>

            <label className="cb-field">
              <span>Your name <i>optional</i></span>
              <input type="text" value={form.by} placeholder="Goes in the run log"
                onChange={(e) => setForm({ ...form, by: e.target.value })} />
            </label>

            {error && <div className="cb-alert">{error}</div>}

            <div className="cb-actions">
              {busy
                ? <button className="cb-btn is-ghost" onClick={stop}>Stop</button>
                : <button className="cb-btn" disabled={loading || !form.focus.trim()} onClick={() => generate()}>
                    {out ? "Generate again" : "Generate the plan"}
                  </button>}
            </div>
            <p className="cb-fine">
              {loading ? "Loading your grid and lead data\u2026"
                : busy ? "Written in five passes so each one lands inside the server's time limit. Takes a couple of minutes."
                : "The brief and the evidence below are what get sent. Nothing else leaves the browser."}
            </p>
          </div>

          <div className="cb-out">
            <EvidencePanel ev={ev} sbuName={sbuName} />

            {(out || busy) && (
              <div className="cb-plan">
                <div className="cb-plan-head">
                  <h3 className="cb-h3">
                    The plan
                    {busy && <i className="cb-dot" />}
                    {busy && stage > 0 && <em className="cb-stage">{stage} of 5 &middot; {STAGE_LABELS[stage - 1]}</em>}
                  </h3>
                  <div className="cb-plan-btns">
                    {out && !busy && (
                      <button className="cb-mini is-primary"
                        onClick={() => download(`relink-${slug}-campaign-pack.html`, buildPack({ md: out, form, sbuName, ev }), "text/html;charset=utf-8")}>
                        Download campaign pack{emails.length ? ` (${emails.length} email${emails.length === 1 ? "" : "s"})` : ""}
                      </button>
                    )}
                    {out && !busy && (
                      <button className="cb-mini" onClick={() => download(`relink-${slug}-campaign.md`, out)}>Markdown</button>
                    )}
                  </div>
                </div>
                <div className="cb-plan-body" ref={outRef}>
                  <Markdown text={out} />
                  {busy && <span className="cb-caret" />}
                </div>
              </div>
            )}

            {!out && !busy && !loading && (
              <div className="cb-empty">
                <p>Fill in the brief and the campaign appears here: the idea and the angle, who it is
                  aimed at and the objections to beat, the offer, a sequenced plan across search, Google,
                  LinkedIn, email and sales enablement, copy for each, keywords, a landing page, how you
                  will know it worked, and an SFMC-ready email.</p>
                <p className="cb-empty-sub">
                  It writes from the evidence above. If that panel looks thin, the plan will say so rather
                  than papering over it.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const CB_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

.cb-root{--esp:#2E2622;--cream:#FAF7F1;--orange:#F38637;--teal:#0598A6;--olive:#90AD51;--line:rgba(46,38,34,.12);--mute:rgba(46,38,34,.55);
  min-height:100vh;box-sizing:border-box;padding:34px 28px 60px;background:var(--cream);color:var(--esp);
  font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.cb-root *,.cb-root *::before,.cb-root *::after{box-sizing:border-box}

.cb-head{max-width:1320px;margin:0 auto 24px}
.cb-eyebrow{margin:0 0 10px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--teal)}
.cb-title{margin:0;font-size:clamp(34px,5vw,50px);font-weight:300;letter-spacing:-.025em;line-height:1}
.cb-title span{font-weight:700;color:var(--orange)}
.cb-sub{margin:12px 0 0;max-width:60ch;font-size:15px;line-height:1.5;color:var(--mute)}

.cb-grid{max-width:1320px;margin:0 auto;display:grid;grid-template-columns:390px 1fr;gap:22px;align-items:start}
.cb-form{position:sticky;top:74px;padding:22px;border:1px solid var(--line);border-radius:14px;background:#fff}
.cb-h3{margin:0 0 14px;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.cb-h4{margin:20px 0 8px;font-size:13.5px;font-weight:700;letter-spacing:-.01em}
.cb-field{display:block;margin-bottom:14px}
.cb-field>span{display:block;margin-bottom:5px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.cb-field>span i{font-style:normal;text-transform:none;letter-spacing:0;color:rgba(46,38,34,.3)}
.cb-field input,.cb-field select,.cb-field textarea{width:100%;padding:9px 12px;border:1px solid rgba(46,38,34,.18);border-radius:9px;background:#fff;
  font-family:'Source Sans 3',sans-serif;font-size:14px;color:#2E2622;resize:vertical}
.cb-field input:focus,.cb-field select:focus,.cb-field textarea:focus{outline:none;border-color:#0598A6;box-shadow:0 0 0 3px rgba(5,152,166,.15)}
.cb-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cb-pills{display:flex;flex-wrap:wrap;gap:5px}
.cb-pill{padding:6px 12px;border:1px solid rgba(46,38,34,.16);border-radius:999px;background:#fff;font-family:inherit;font-size:12px;font-weight:600;color:var(--mute);cursor:pointer;transition:all .16s ease}
.cb-pill:hover{border-color:#0598A6;color:#0598A6}
.cb-pill.is-on{background:#0598A6;border-color:#0598A6;color:#fff}
.cb-actions{margin-top:18px}
.cb-btn{padding:11px 24px;border:none;border-radius:999px;background:#F38637;color:#fff;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background .16s ease}
.cb-btn:hover{background:#e0752a}
.cb-btn:disabled{opacity:.35;cursor:not-allowed}
.cb-btn.is-ghost{background:transparent;border:1px solid rgba(46,38,34,.2);color:rgba(46,38,34,.7)}
.cb-fine{margin:12px 0 0;font-size:11.5px;line-height:1.5;color:rgba(46,38,34,.42)}
.cb-alert{margin-top:12px;padding:11px 14px;border-radius:10px;background:rgba(243,134,55,.13);border:1px solid rgba(243,134,55,.45);font-size:13px;color:#8A4A16}

.cb-out{min-width:0;display:flex;flex-direction:column;gap:18px}
.cb-ev{padding:20px 22px;border:1px solid var(--line);border-radius:14px;background:#fff}
.cb-ev-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap}
.cb-ev-head .cb-h3{margin-bottom:0}
.cb-ev-note{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.05em;color:rgba(46,38,34,.35);max-width:38ch;text-align:right}
.cb-ev-note b{font-weight:500;color:rgba(46,38,34,.55)}
.cb-flag{margin:14px 0 0;padding:11px 14px;border-radius:9px;background:rgba(5,152,166,.08);border:1px solid rgba(5,152,166,.3);font-size:12.5px;line-height:1.55;color:rgba(46,38,34,.7)}
.cb-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:16px}
.cb-stats div{padding:13px 14px;border:1px solid var(--line);border-radius:11px;display:flex;flex-direction:column}
.cb-stats span{font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(46,38,34,.42)}
.cb-stats b{margin-top:7px;font-size:23px;font-weight:700;letter-spacing:-.03em;line-height:1}
.cb-stats i{margin-top:4px;font-style:normal;font-size:11px;color:rgba(46,38,34,.45)}
.cb-chips{display:flex;flex-wrap:wrap;gap:6px}
.cb-chip{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border:1px solid rgba(5,152,166,.35);border-radius:999px;font-size:12px;font-weight:600;color:#0598A6}
.cb-chip i{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:rgba(46,38,34,.45)}

.cb-plan{padding:20px 22px 8px;border:1px solid var(--line);border-radius:14px;background:#fff;min-width:0}
.cb-plan-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--line)}
.cb-plan-head .cb-h3{margin-bottom:0;display:flex;align-items:center;gap:8px}
.cb-plan-btns{display:flex;gap:6px}
.cb-dot{width:7px;height:7px;border-radius:50%;background:#F38637;animation:cbpulse 1.1s ease-in-out infinite}
.cb-stage{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.09em;text-transform:none;color:rgba(46,38,34,.4)}
@keyframes cbpulse{0%,100%{opacity:.25}50%{opacity:1}}
.cb-mini{padding:5px 12px;border:1px solid rgba(46,38,34,.18);border-radius:999px;background:#fff;font-family:inherit;font-size:11.5px;font-weight:600;color:rgba(46,38,34,.6);cursor:pointer}
.cb-mini:hover{border-color:#2E2622;color:#2E2622}
.cb-mini.is-primary{background:#F38637;border-color:#F38637;color:#fff}
.cb-mini.is-primary:hover{background:#e0752a;border-color:#e0752a;color:#fff}
.cb-plan-body{max-height:78vh;overflow-y:auto;padding-top:4px}
.cb-caret{display:inline-block;width:8px;height:15px;background:#F38637;vertical-align:text-bottom;animation:cbpulse .9s ease-in-out infinite}

.cb-plan-body .cb-h3{margin:26px 0 10px;font-size:11.5px;color:#0598A6}
.cb-plan-body .cb-h3:first-child{margin-top:6px}
.cb-p{margin:0 0 11px;font-size:14px;line-height:1.65}
.cb-ul,.cb-ol{margin:0 0 13px;padding-left:20px}
.cb-ul li,.cb-ol li{margin-bottom:5px;font-size:13.5px;line-height:1.6}
.cb-ul li.is-sub{list-style:none;position:relative;padding-left:12px;color:rgba(46,38,34,.6);font-size:12.5px}
.cb-ul li.is-sub::before{content:'\\2014';position:absolute;left:-4px;color:rgba(46,38,34,.3)}
.cb-quote{margin:0 0 12px;padding:10px 14px;border-left:3px solid #F38637;background:rgba(243,134,55,.08);border-radius:0 8px 8px 0;font-size:13px;line-height:1.55}
.cb-code{font-family:'IBM Plex Mono',monospace;font-size:12px;background:rgba(46,38,34,.07);padding:2px 5px;border-radius:4px}
.cb-tablewrap{overflow-x:auto;margin:0 0 16px}
.cb-table{width:100%;border-collapse:collapse;font-size:12.5px}
.cb-table th{text-align:left;padding:0 12px 8px 0;font-family:'IBM Plex Mono',monospace;font-size:8.5px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:rgba(46,38,34,.42);border-bottom:1px solid var(--line);white-space:nowrap}
.cb-table td{padding:9px 12px 9px 0;border-bottom:1px solid rgba(46,38,34,.08);vertical-align:top;line-height:1.45}
.cb-table td:first-child{font-weight:600}
.cb-block{margin:0 0 16px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.cb-block-head{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:rgba(46,38,34,.04);border-bottom:1px solid var(--line);
  font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.cb-pre{margin:0;padding:14px;max-height:340px;overflow:auto;font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:rgba(46,38,34,.75)}

.cb-empty{padding:40px 30px;border:1px dashed rgba(46,38,34,.2);border-radius:14px;background:#fff;text-align:center}
.cb-empty p{margin:0 auto;max-width:56ch;font-size:14.5px;line-height:1.6;color:var(--mute)}
.cb-empty-sub{margin-top:12px !important;font-size:12.5px !important;color:rgba(46,38,34,.4) !important}

@media (max-width:1080px){
  .cb-grid{grid-template-columns:1fr}
  .cb-form{position:static}
  .cb-stats{grid-template-columns:1fr 1fr}
}
@media (max-width:560px){
  .cb-root{padding:26px 16px 48px}
  .cb-row{grid-template-columns:1fr}
  .cb-stats{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){.cb-root *{animation:none !important;transition:none !important}}
@media print{.cb-form,.cb-empty{display:none}.cb-plan-body{max-height:none;overflow:visible}}
`;
