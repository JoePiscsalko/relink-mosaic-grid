import React, { useState, useMemo, useEffect, useRef } from "react";
/* ==================================================================
   FORM FILLS — parsing, classification and attribution

   Everything below is pure: strings in, records out. No React, no
   DOM. It mirrors the Python weekly pipeline so the numbers in the
   app and the numbers in the PDF agree.

   Order of classification matters and is deliberate:
     1. internal test   staff address or reLink company name
     2. direct-endpoint bot   no Source URL and no Path Label
     3. known spam domain
     4. cold-outreach phrasing
     5. non-Latin short message
     6. otherwise a genuine lead

   Step 2 is the workhorse. A real submission always carries the page
   it came from and the wizard path it took; a script POSTing at the
   endpoint carries neither.
================================================================== */

const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

function parseEntryDate(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return null;
  const m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]?\.?)?$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (mo != null) {
      let h = m[4] ? +m[4] : 0;
      if (m[7]) {
        const pm = m[7].toLowerCase() === "p";
        if (pm && h < 12) h += 12;
        if (!pm && h === 12) h = 0;
      }
      return new Date(+m[3], mo, +m[2], h, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    }
  }
  const d = new Date(s.replace(" ", "T"));
  if (!isNaN(d.getTime())) return d;
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* Weeks run Monday to Sunday, matching the weekly report. */
function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return isoDay(x);
}

/* ---------------- file decoding ---------------- */
function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  let nul = 0;
  const n = Math.min(b.length, 600);
  for (let i = 1; i < n; i += 2) if (b[i] === 0) nul++;
  if (nul > n / 5) return new TextDecoder("utf-16le").decode(buf);
  return new TextDecoder("utf-8").decode(buf).replace(/^\ufeff/, "");
}
function detectDelim(text) {
  const head = text.split("\n").slice(0, 10).join("\n");
  const t = (head.match(/\t/g) || []).length;
  const s = (head.match(/;/g) || []).length;
  const c = (head.match(/,/g) || []).length;
  if (t > 0 && t >= c && t >= s) return "\t";
  return s > c ? ";" : ",";
}
function parseDelimited(text, d) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((x) => x.some((y) => String(y).trim() !== ""));
}

const norm = (s) =>
  String(s == null ? "" : s).trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const COLS = {
  date:    ["entry date", "date created", "date submitted", "date"],
  id:      ["entry id", "id"],
  ip:      ["user ip", "ip address", "ip"],
  ua:      ["user agent", "browser"],
  name:    ["name", "full name", "your name", "contact name"],
  email:   ["email", "email address", "your email"],
  company: ["company", "company name", "organization", "facility", "hospital"],
  message: ["message", "comments", "details", "notes", "how can we help"],
  path:    ["path label", "path", "request type"],
  cat:     ["category label", "category", "equipment category"],
  source:  ["source url", "page url", "landing page", "form page"],
  journey: ["user journey information", "user journey", "journey", "user journey info"],
};

function mapColumns(header) {
  const h = header.map(norm);
  const col = {};
  Object.entries(COLS).forEach(([field, names]) => {
    let idx = -1;
    for (const n of names) {
      idx = h.indexOf(n);
      if (idx >= 0) break;
    }
    col[field] = idx;
  });
  return col;
}

/* ---------------- classification ---------------- */
const INTERNAL_EMAIL = /piscsalko|@relinkmedical\.com/i;
const INTERNAL_COMPANY = /^(relink medical|relink|relinkmedical|test|testing|qa)$/i;
const INTERNAL_NAME = /^(test|testing|asdf|qwerty)\b/i;

const SPAM_DOMAINS = [
  /duhastmail/i, /legenmail/i, /bekommenmail/i, /fuhrenmail/i, /bonjourfmail/i,
  /salpingomyu/i, /@mail\.ru$/i, /@rambler\.ru$/i, /@yandex\./i, /\.ru$/i,
  /@qq\.com$/i, /closygm/i,
];

const SPAM_PHRASES = [
  /\bseo\b/i, /back ?links?/i, /guest post/i, /\bweb ?design\b/i,
  /rank (higher|on google|your site)/i, /digital marketing (services|agency|company)/i,
  /increase (your )?(website )?traffic/i, /\bcrypto(currency)?\b/i, /\bbitcoin\b/i,
  /\binvestment opportunit/i, /\bbusiness loan\b/i, /\bmerchant cash advance\b/i,
  /\beric jones\b/i, /talk with me/i, /\bcbd\b/i, /\bcasino\b/i,
  /website (audit|analysis) (for|of) free/i, /\blead generation service/i,
];

const nonAsciiShare = (s) => {
  if (!s) return 0;
  const bad = (s.match(/[^\x00-\x7F]/g) || []).length;
  return bad / s.length;
};

/* Returns { klass, reason }. klass is lead | spam | test. */
function classify(e) {
  const email = String(e.email || "").toLowerCase().trim();
  const company = String(e.company || "").trim();
  const name = String(e.name || "").trim();
  const msg = String(e.message || "");
  const src = String(e.source || "").trim();
  const path = String(e.path || "").trim();

  if (INTERNAL_EMAIL.test(email) || INTERNAL_COMPANY.test(company) || INTERNAL_NAME.test(name))
    return { klass: "test", reason: "Internal address or test entry" };

  if (!src && !path)
    return { klass: "spam", reason: "Direct endpoint POST — no source page, no wizard path" };

  if (SPAM_DOMAINS.some((rx) => rx.test(email)))
    return { klass: "spam", reason: "Known throwaway or bot sender domain" };

  const blob = `${msg} ${company} ${name}`;
  if (SPAM_PHRASES.some((rx) => rx.test(blob)))
    return { klass: "spam", reason: "Cold outreach phrasing" };

  if (msg && msg.length < 200 && nonAsciiShare(msg) > 0.3)
    return { klass: "spam", reason: "Short non-Latin message" };

  return { klass: "lead", reason: "" };
}

/* ---------------- channel attribution ---------------- */
/* Dual signal: UTM and paid click IDs off the Source URL first,
   then the referring hostname out of the journey field. Anything
   with no signal at all is Direct, which is honest rather than
   flattering. */

const CHANNEL_ORDER = [
  "Google Ads", "Organic Search", "Email", "LinkedIn", "Paid Social",
  "AI Assistant", "reLinkOnline", "Referral", "Direct", "Other",
];

function queryOf(url) {
  const out = {};
  const qi = url.indexOf("?");
  if (qi < 0) return out;
  url.slice(qi + 1).split("&").forEach((pair) => {
    if (!pair) return;
    const eq = pair.indexOf("=");
    const k = (eq < 0 ? pair : pair.slice(0, eq)).toLowerCase();
    let v = eq < 0 ? "" : pair.slice(eq + 1);
    try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (err) { /* leave raw */ }
    out[k] = v;
  });
  return out;
}

function hostOf(url) {
  const m = String(url || "").match(/^https?:\/\/([^/?#\s]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}

function fromUtm(u) {
  const v = u.toLowerCase();
  if (/relinkonline/.test(v)) return "reLinkOnline";
  if (/sfmc|exacttarget|marketingcloud|klaviyo|^email$|newsletter/.test(v)) return "Email";
  if (/linkedin/.test(v)) return "LinkedIn";
  if (/facebook|^fb$|instagram|meta/.test(v)) return "Paid Social";
  if (/google/.test(v)) return "Google Ads";
  if (/bing|microsoft/.test(v)) return "Google Ads";
  return null;
}

function fromHost(h) {
  if (!h) return null;
  if (/relinkonline/.test(h)) return "reLinkOnline";
  if (/chatgpt|openai|perplexity|claude\.ai|copilot\.microsoft|gemini\.google/.test(h)) return "AI Assistant";
  if (/^(www\.)?google\.|^google\.|bing\.|duckduckgo\.|search\.yahoo|ecosia\.|brave\.com/.test(h)) return "Organic Search";
  if (/linkedin\.|lnkd\.in/.test(h)) return "LinkedIn";
  if (/facebook\.|instagram\.|fb\.com|t\.co|twitter\.|x\.com/.test(h)) return "Paid Social";
  if (/mail\.google|outlook\.|mail\.yahoo/.test(h)) return "Email";
  return "Referral";
}

/* Returns the channel AND the signal it was decided on, so the detail
   view can show its working. "Direct" is usually not a real channel —
   it is the absence of one — and saying so is more useful than a bare
   label a manager has to take on trust. */
function attribute(e) {
  const src = String(e.source || "").trim();
  if (src) {
    const q = queryOf(src);
    const utm = q.utm_source || q.utm_medium || "";
    if (utm) {
      const hit = fromUtm(utm);
      if (hit) return { channel: hit, signal: `utm_source=${utm}` };
    }
    if (q.gclid || q.gad_campaignid || q.gbraid || q.wbraid || q.gad_source)
      return { channel: "Google Ads", signal: "Google paid click ID on the landing page" };
    if (q.fbclid) return { channel: "Paid Social", signal: "Meta click ID on the landing page" };
    if (q.li_fat_id) return { channel: "LinkedIn", signal: "LinkedIn click ID on the landing page" };
    if (q.mid || q.sfmc_id || q.j || q.jb) return { channel: "Email", signal: "SFMC tracking parameter" };
    if (/relinkonline/.test(hostOf(src))) return { channel: "reLinkOnline", signal: "submitted from a reLinkOnline page" };
  }

  const journey = String(e.journey || "");
  const hosts = (journey.match(/https?:\/\/[^\s"'<>)]+/g) || [])
    .map(hostOf)
    .filter((h) => h && !/relinkmedical\.com$/.test(h));
  for (const h of hosts) {
    const hit = fromHost(h);
    if (hit) return { channel: hit, signal: `referred by ${h}` };
  }

  if (src) return { channel: "Direct", signal: "no UTM and no referrer — the source is genuinely unknown" };
  return { channel: "Other", signal: "no landing page recorded" };
}

const channelOf = (e) => attribute(e).channel;

/* ---------------- whole-file parse ---------------- */
function parseEntries(text) {
  const rows = parseDelimited(text, detectDelim(text));
  if (!rows.length) return { error: "That file came through empty." };

  let head = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const c = mapColumns(rows[i]);
    if (c.date >= 0 && (c.email >= 0 || c.name >= 0)) { head = i; break; }
  }
  if (head < 0)
    return { error: "Couldn't find the header row. This should be the raw WPForms entry export, with Entry Date and Email columns." };

  const col = mapColumns(rows[head]);
  const missing = [];
  if (col.source < 0) missing.push("Source URL");
  if (col.path < 0) missing.push("Path Label");
  if (col.journey < 0) missing.push("User Journey information");

  const val = (rw, i) => (i >= 0 ? String(rw[i] == null ? "" : rw[i]).trim() : "");
  const out = [];
  let undated = 0;

  rows.slice(head + 1).forEach((rw, n) => {
    const d = parseEntryDate(val(rw, col.date));
    if (!d) { undated++; return; }
    const e = {
      id: val(rw, col.id) || `row-${n + 1}`,
      dt: `${isoDay(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      day: isoDay(d),
      week: weekStart(d),
      name: val(rw, col.name),
      email: val(rw, col.email),
      company: val(rw, col.company),
      message: val(rw, col.message),
      path: val(rw, col.path),
      cat: val(rw, col.cat),
      source: val(rw, col.source),
      journey: val(rw, col.journey),
      ip: val(rw, col.ip),
    };
    const c = classify(e);
    e.klass = c.klass;
    e.reason = c.reason;
    if (c.klass === "lead") {
      const a = attribute(e);
      e.channel = a.channel;
      e.signal = a.signal;
    } else {
      e.channel = "";
      e.signal = "";
    }
    e.src = e.source;          /* landing page, for checking attribution */
    delete e.journey;          /* the browsing trail is not kept */
    delete e.source;
    out.push(e);
  });

  if (!out.length) return { error: "No rows had a readable Entry Date, so there's nothing to report on." };

  const days = out.map((x) => x.day).sort();
  return {
    entries: out,
    missing,
    stats: {
      total: out.length,
      undated,
      leads: out.filter((x) => x.klass === "lead").length,
      spam: out.filter((x) => x.klass === "spam").length,
      tests: out.filter((x) => x.klass === "test").length,
      first: days[0],
      last: days[days.length - 1],
    },
  };
}

/* ---------------- aggregation ---------------- */
function summarise(entries, from, to) {
  const inRange = (e) => (!from ? true : e.day >= from && e.day <= to);
  const rows = entries.filter(inRange);
  const leads = rows.filter((e) => e.klass === "lead");

  const tally = (list, keyFn) => {
    const m = {};
    list.forEach((e) => {
      const k = keyFn(e) || "Not recorded";
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };

  const byDay = {};
  rows.forEach((e) => {
    const d = (byDay[e.day] = byDay[e.day] || { day: e.day, lead: 0, spam: 0, test: 0 });
    d[e.klass]++;
  });
  const byWeek = {};
  rows.forEach((e) => {
    const w = (byWeek[e.week] = byWeek[e.week] || { week: e.week, lead: 0, spam: 0, test: 0 });
    w[e.klass]++;
  });

  return {
    rows,
    leads,
    counts: {
      total: rows.length,
      lead: leads.length,
      spam: rows.filter((e) => e.klass === "spam").length,
      test: rows.filter((e) => e.klass === "test").length,
    },
    quality: rows.length ? leads.length / rows.length : null,
    days: Object.values(byDay).sort((a, b) => (a.day < b.day ? -1 : 1)),
    weeks: Object.values(byWeek).sort((a, b) => (a.week < b.week ? -1 : 1)),
    paths: tally(leads, (e) => e.path),
    channels: tally(leads, (e) => e.channel),
    cats: tally(leads, (e) => e.cat),
    reasons: tally(rows.filter((e) => e.klass === "spam"), (e) => e.reason),
  };
}

/* ---------------- built-in sample ----------------
   Classified output of the WPForms #11986 export of August 17 2026,
   with every identifying field removed: no names, no emails, no
   company names, no message text. What remains is the shape of the
   data — when it arrived, what was asked for, where it came from —
   which is all the charts need.

   This is what the tab shows before anything has been published, and
   it is safe to sit in a public repo. Import a fresh export and it is
   replaced entirely.
-------------------------------------------------- */
const SEED_KLASS = ["lead","spam","test"];
const SEED_PATHS = ["Sell equipment","Something else","Buy equipment","Schedule a pickup","Discuss a project","Service equipment","Share feedback","Start a reLink360 program"];
const SEED_CATS = ["Not sure","Mixed lot / Multiple categories","Imaging","Biomed / Patient care","I'm an international buyer","Lab","Surgical","Talk to a Product Manager","Hospital closure or department shutdown","Talk to an Account Executive","Pickup experience","Not sure yet — need help scoping"];
const SEED_CHANNELS = ["Organic Search","Direct","Google Ads","reLinkOnline","AI Assistant","Referral","Email"];
const SEED_REASONS = ["Direct endpoint POST — no source page, no wizard path","Internal address or test entry","Short non-Latin message","Known throwaway or bot sender domain"];
const SEED_SIGNALS = ["referred by google.com","no UTM and no referrer — the source is genuinely unknown","Google paid click ID on the landing page","utm_source=relinkonline","referred by relinkonline.com","referred by chatgpt.com","referred by bing.com","referred by relinkmedical.proxibid.com","referred by secure.livechatinc.com","referred by doubao.com","referred by search.brave.com","referred by search.yahoo.com","referred by duckduckgo.com","utm_source=sfmc","referred by itm.ebaydesc.com"];

/* [ timestamp, klass, path, category, channel, spam reason, attribution signal ] — -1 means none */
const SEED_ROWS = [
  ["2026-08-17T07:21",1,-1,-1,-1,0,-1],
  ["2026-08-17T02:00",1,-1,-1,-1,0,-1],
  ["2026-08-16T21:03",0,0,0,0,-1,0],
  ["2026-08-16T09:17",0,0,1,1,-1,1],
  ["2026-08-16T05:08",1,-1,-1,-1,0,-1],
  ["2026-08-16T05:08",1,-1,-1,-1,0,-1],
  ["2026-08-16T05:08",1,-1,-1,-1,0,-1],
  ["2026-08-16T05:08",1,-1,-1,-1,0,-1],
  ["2026-08-16T05:08",1,-1,-1,-1,0,-1],
  ["2026-08-15T22:45",1,-1,-1,-1,0,-1],
  ["2026-08-15T15:39",0,0,2,0,-1,0],
  ["2026-08-15T13:33",1,-1,-1,-1,0,-1],
  ["2026-08-15T13:32",1,-1,-1,-1,0,-1],
  ["2026-08-15T06:15",0,0,3,2,-1,2],
  ["2026-08-15T05:19",1,-1,-1,-1,0,-1],
  ["2026-08-14T16:59",1,-1,-1,-1,0,-1],
  ["2026-08-14T15:48",0,0,3,3,-1,3],
  ["2026-08-14T15:23",0,0,0,1,-1,1],
  ["2026-08-14T11:33",0,0,3,1,-1,1],
  ["2026-08-14T09:49",0,0,3,0,-1,0],
  ["2026-08-14T03:25",1,-1,-1,-1,0,-1],
  ["2026-08-13T16:32",0,1,-1,1,-1,1],
  ["2026-08-13T16:07",0,0,3,1,-1,1],
  ["2026-08-13T10:42",0,0,2,3,-1,4],
  ["2026-08-13T06:05",0,2,4,0,-1,0],
  ["2026-08-12T16:51",0,0,1,3,-1,3],
  ["2026-08-12T13:34",0,0,3,1,-1,1],
  ["2026-08-12T13:33",0,0,5,0,-1,0],
  ["2026-08-12T13:30",0,0,1,3,-1,3],
  ["2026-08-12T07:48",1,-1,-1,-1,0,-1],
  ["2026-08-12T02:16",0,0,6,3,-1,3],
  ["2026-08-11T23:50",1,-1,-1,-1,0,-1],
  ["2026-08-11T22:50",1,-1,-1,-1,0,-1],
  ["2026-08-11T18:06",1,-1,-1,-1,0,-1],
  ["2026-08-11T13:11",0,2,7,4,-1,5],
  ["2026-08-11T12:35",0,0,3,1,-1,1],
  ["2026-08-11T11:27",1,-1,-1,-1,0,-1],
  ["2026-08-11T03:50",0,0,0,3,-1,3],
  ["2026-08-10T21:28",1,-1,-1,-1,0,-1],
  ["2026-08-10T21:06",0,1,-1,1,-1,1],
  ["2026-08-10T20:05",0,0,6,1,-1,1],
  ["2026-08-10T16:45",0,1,-1,1,-1,1],
  ["2026-08-10T15:23",0,0,0,1,-1,1],
  ["2026-08-10T15:00",0,0,0,0,-1,0],
  ["2026-08-10T14:40",0,0,2,3,-1,3],
  ["2026-08-10T14:36",0,0,3,3,-1,4],
  ["2026-08-10T10:53",0,0,3,0,-1,0],
  ["2026-08-10T05:21",0,0,2,0,-1,0],
  ["2026-08-10T04:09",1,-1,-1,-1,0,-1],
  ["2026-08-10T04:09",1,-1,-1,-1,0,-1],
  ["2026-08-10T04:09",1,-1,-1,-1,0,-1],
  ["2026-08-10T04:05",1,-1,-1,-1,0,-1],
  ["2026-08-09T16:53",1,-1,-1,-1,0,-1],
  ["2026-08-09T07:39",1,-1,-1,-1,0,-1],
  ["2026-08-09T07:39",1,-1,-1,-1,0,-1],
  ["2026-08-09T07:39",1,-1,-1,-1,0,-1],
  ["2026-08-09T07:39",1,-1,-1,-1,0,-1],
  ["2026-08-09T06:55",1,-1,-1,-1,0,-1],
  ["2026-08-09T06:55",1,-1,-1,-1,0,-1],
  ["2026-08-09T05:37",1,-1,-1,-1,0,-1],
  ["2026-08-09T05:37",1,-1,-1,-1,0,-1],
  ["2026-08-09T03:36",1,-1,-1,-1,0,-1],
  ["2026-08-09T03:34",1,-1,-1,-1,0,-1],
  ["2026-08-09T03:34",1,-1,-1,-1,0,-1],
  ["2026-08-09T03:06",1,-1,-1,-1,0,-1],
  ["2026-08-08T12:50",1,-1,-1,-1,0,-1],
  ["2026-08-08T02:28",1,-1,-1,-1,0,-1],
  ["2026-08-07T18:17",1,-1,-1,-1,0,-1],
  ["2026-08-07T16:42",0,0,0,3,-1,4],
  ["2026-08-07T15:06",0,0,6,3,-1,4],
  ["2026-08-07T14:57",0,2,7,3,-1,3],
  ["2026-08-07T02:31",0,2,7,3,-1,3],
  ["2026-08-06T23:29",1,-1,-1,-1,0,-1],
  ["2026-08-06T19:53",1,-1,-1,-1,0,-1],
  ["2026-08-06T15:01",0,2,7,0,-1,6],
  ["2026-08-06T14:16",0,0,1,0,-1,0],
  ["2026-08-06T13:46",1,-1,-1,-1,0,-1],
  ["2026-08-06T13:46",0,2,7,5,-1,7],
  ["2026-08-06T12:12",0,3,-1,0,-1,6],
  ["2026-08-06T11:35",0,0,5,1,-1,1],
  ["2026-08-06T07:04",0,0,1,2,-1,2],
  ["2026-08-06T05:45",1,-1,-1,-1,0,-1],
  ["2026-08-05T20:35",1,-1,-1,-1,0,-1],
  ["2026-08-05T17:37",0,0,0,1,-1,1],
  ["2026-08-05T17:00",1,-1,-1,-1,0,-1],
  ["2026-08-05T14:37",0,0,2,5,-1,8],
  ["2026-08-05T12:50",0,3,-1,0,-1,6],
  ["2026-08-05T08:55",0,1,-1,1,-1,1],
  ["2026-08-05T06:48",0,0,2,3,-1,4],
  ["2026-08-04T16:19",1,-1,-1,-1,0,-1],
  ["2026-08-03T18:57",0,0,0,1,-1,1],
  ["2026-08-03T18:52",0,0,3,0,-1,0],
  ["2026-08-03T17:40",0,0,0,0,-1,0],
  ["2026-08-03T12:45",1,-1,-1,-1,0,-1],
  ["2026-08-03T12:16",0,2,7,0,-1,0],
  ["2026-08-03T07:34",0,0,1,0,-1,0],
  ["2026-08-02T14:17",1,-1,-1,-1,0,-1],
  ["2026-08-02T12:33",0,0,0,0,-1,0],
  ["2026-08-02T07:51",1,-1,-1,-1,0,-1],
  ["2026-08-02T02:01",0,0,2,0,-1,0],
  ["2026-07-31T16:03",0,0,1,3,-1,4],
  ["2026-07-31T13:23",0,0,1,1,-1,1],
  ["2026-07-31T12:42",0,0,6,0,-1,0],
  ["2026-07-31T11:19",0,0,0,1,-1,1],
  ["2026-07-31T10:46",0,0,6,3,-1,4],
  ["2026-07-30T16:59",1,-1,-1,-1,0,-1],
  ["2026-07-30T12:18",0,0,6,1,-1,1],
  ["2026-07-30T10:41",0,0,3,1,-1,1],
  ["2026-07-30T02:30",0,0,0,0,-1,0],
  ["2026-07-29T13:39",0,0,3,1,-1,1],
  ["2026-07-29T11:41",0,0,0,1,-1,1],
  ["2026-07-29T07:27",1,-1,-1,-1,0,-1],
  ["2026-07-29T05:53",0,2,7,5,-1,9],
  ["2026-07-29T03:13",1,-1,-1,-1,0,-1],
  ["2026-07-28T18:37",1,-1,-1,-1,0,-1],
  ["2026-07-28T12:09",0,2,7,3,-1,3],
  ["2026-07-28T11:52",0,3,-1,1,-1,1],
  ["2026-07-27T23:33",0,2,4,0,-1,0],
  ["2026-07-27T18:53",1,-1,-1,-1,0,-1],
  ["2026-07-27T14:52",0,0,2,1,-1,1],
  ["2026-07-27T14:39",0,0,6,3,-1,3],
  ["2026-07-27T14:27",0,0,5,0,-1,0],
  ["2026-07-27T12:51",0,0,3,3,-1,3],
  ["2026-07-27T10:42",0,4,8,0,-1,6],
  ["2026-07-27T01:48",1,-1,-1,-1,0,-1],
  ["2026-07-26T16:44",0,0,3,3,-1,3],
  ["2026-07-26T13:40",0,1,-1,3,-1,4],
  ["2026-07-26T09:15",1,-1,-1,-1,0,-1],
  ["2026-07-26T08:35",0,1,-1,3,-1,3],
  ["2026-07-25T22:07",1,-1,-1,-1,0,-1],
  ["2026-07-25T15:24",1,-1,-1,-1,0,-1],
  ["2026-07-25T12:06",0,0,0,0,-1,0],
  ["2026-07-24T18:44",1,-1,-1,-1,0,-1],
  ["2026-07-24T18:22",1,-1,-1,-1,0,-1],
  ["2026-07-24T10:21",0,0,3,0,-1,0],
  ["2026-07-23T17:34",1,-1,-1,-1,0,-1],
  ["2026-07-23T14:27",0,0,3,0,-1,0],
  ["2026-07-23T13:21",0,0,0,0,-1,10],
  ["2026-07-23T10:38",0,0,3,0,-1,0],
  ["2026-07-23T10:15",0,0,3,1,-1,1],
  ["2026-07-23T02:48",1,-1,-1,-1,0,-1],
  ["2026-07-22T20:32",1,-1,-1,-1,0,-1],
  ["2026-07-22T17:44",0,0,0,1,-1,1],
  ["2026-07-22T16:21",1,-1,-1,-1,0,-1],
  ["2026-07-22T13:46",0,0,5,1,-1,1],
  ["2026-07-22T13:29",0,0,2,1,-1,1],
  ["2026-07-22T11:35",0,0,0,1,-1,1],
  ["2026-07-22T06:29",0,2,7,1,-1,1],
  ["2026-07-21T17:59",0,0,2,4,-1,5],
  ["2026-07-21T16:30",0,0,3,3,-1,3],
  ["2026-07-21T13:30",0,2,9,1,-1,1],
  ["2026-07-21T09:59",0,5,2,0,-1,6],
  ["2026-07-21T08:41",0,2,4,0,-1,0],
  ["2026-07-21T05:04",0,2,7,1,-1,1],
  ["2026-07-21T00:55",0,0,2,2,-1,2],
  ["2026-07-20T23:35",0,2,4,0,-1,0],
  ["2026-07-20T22:11",0,0,0,3,-1,3],
  ["2026-07-20T20:44",1,-1,-1,-1,0,-1],
  ["2026-07-20T18:52",0,0,6,1,-1,1],
  ["2026-07-20T18:11",1,-1,-1,-1,0,-1],
  ["2026-07-20T17:30",0,0,3,3,-1,3],
  ["2026-07-20T14:49",0,6,10,1,-1,1],
  ["2026-07-20T14:35",0,0,6,3,-1,3],
  ["2026-07-20T13:36",0,0,1,1,-1,1],
  ["2026-07-20T12:22",1,-1,-1,-1,0,-1],
  ["2026-07-20T10:07",0,0,1,1,-1,1],
  ["2026-07-20T00:36",0,0,3,3,-1,3],
  ["2026-07-20T00:27",1,-1,-1,-1,0,-1],
  ["2026-07-19T21:42",0,0,3,0,-1,0],
  ["2026-07-19T08:03",1,-1,-1,-1,0,-1],
  ["2026-07-18T21:35",0,0,3,1,-1,1],
  ["2026-07-18T16:48",0,2,7,1,-1,1],
  ["2026-07-18T11:45",0,0,2,1,-1,1],
  ["2026-07-18T08:21",1,-1,-1,-1,0,-1],
  ["2026-07-17T20:03",0,0,6,3,-1,3],
  ["2026-07-17T17:03",0,0,0,0,-1,0],
  ["2026-07-17T14:52",0,1,-1,1,-1,1],
  ["2026-07-17T14:15",0,0,5,1,-1,1],
  ["2026-07-17T10:02",0,0,3,0,-1,6],
  ["2026-07-17T06:24",0,0,3,0,-1,0],
  ["2026-07-17T01:25",0,0,0,3,-1,3],
  ["2026-07-16T14:04",1,-1,-1,-1,0,-1],
  ["2026-07-16T13:27",0,1,-1,3,-1,4],
  ["2026-07-16T12:59",2,0,6,-1,1,-1],
  ["2026-07-16T12:39",2,0,6,-1,1,-1],
  ["2026-07-16T11:23",0,0,5,1,-1,1],
  ["2026-07-16T11:21",0,0,5,1,-1,1],
  ["2026-07-16T07:45",0,0,6,0,-1,0],
  ["2026-07-16T02:21",1,-1,-1,-1,0,-1],
  ["2026-07-15T20:53",0,3,-1,1,-1,1],
  ["2026-07-15T15:41",0,0,0,3,-1,4],
  ["2026-07-15T14:33",0,0,3,3,-1,3],
  ["2026-07-15T12:53",0,0,2,3,-1,3],
  ["2026-07-15T10:46",0,0,3,1,-1,1],
  ["2026-07-14T21:24",0,0,6,0,-1,0],
  ["2026-07-14T20:17",0,0,3,0,-1,11],
  ["2026-07-14T18:02",1,-1,-1,-1,0,-1],
  ["2026-07-14T17:45",0,1,-1,0,-1,0],
  ["2026-07-14T17:22",0,0,0,0,-1,0],
  ["2026-07-14T16:31",0,6,10,1,-1,1],
  ["2026-07-14T15:23",0,0,0,0,-1,0],
  ["2026-07-14T14:20",0,0,3,0,-1,6],
  ["2026-07-14T13:39",0,0,0,0,-1,12],
  ["2026-07-13T16:49",0,0,0,3,-1,3],
  ["2026-07-13T15:57",0,0,5,5,-1,8],
  ["2026-07-13T13:23",0,0,1,0,-1,0],
  ["2026-07-13T11:06",0,6,10,1,-1,1],
  ["2026-07-13T10:38",0,6,10,1,-1,1],
  ["2026-07-13T10:16",0,6,10,1,-1,1],
  ["2026-07-13T09:43",0,2,4,0,-1,0],
  ["2026-07-13T06:47",1,-1,-1,-1,0,-1],
  ["2026-07-13T04:16",1,-1,-1,-1,0,-1],
  ["2026-07-13T02:05",0,1,-1,3,-1,4],
  ["2026-07-12T20:57",1,-1,-1,-1,0,-1],
  ["2026-07-12T20:53",0,0,3,0,-1,0],
  ["2026-07-12T17:47",1,-1,-1,-1,0,-1],
  ["2026-07-12T17:28",1,-1,-1,-1,0,-1],
  ["2026-07-11T19:05",0,0,1,3,-1,4],
  ["2026-07-11T11:06",0,0,0,2,-1,2],
  ["2026-07-11T09:09",0,0,3,0,-1,0],
  ["2026-07-10T12:52",0,0,2,0,-1,6],
  ["2026-07-10T12:23",0,0,6,6,-1,13],
  ["2026-07-10T11:49",0,0,3,3,-1,3],
  ["2026-07-10T10:44",0,0,0,0,-1,6],
  ["2026-07-10T06:45",1,-1,-1,-1,0,-1],
  ["2026-07-10T06:23",0,0,0,3,-1,3],
  ["2026-07-10T04:38",1,-1,-1,-1,0,-1],
  ["2026-07-10T04:06",1,-1,-1,-1,0,-1],
  ["2026-07-10T04:00",1,-1,-1,-1,0,-1],
  ["2026-07-10T02:09",1,-1,-1,-1,0,-1],
  ["2026-07-09T22:28",0,0,6,3,-1,3],
  ["2026-07-09T20:22",1,-1,-1,-1,0,-1],
  ["2026-07-09T16:12",0,0,0,1,-1,1],
  ["2026-07-09T11:29",0,0,3,3,-1,4],
  ["2026-07-08T16:21",1,-1,-1,-1,0,-1],
  ["2026-07-08T15:14",0,1,-1,1,-1,1],
  ["2026-07-08T11:19",1,-1,-1,-1,0,-1],
  ["2026-07-08T05:16",1,-1,-1,-1,0,-1],
  ["2026-07-08T04:38",1,-1,-1,-1,0,-1],
  ["2026-07-08T04:29",1,-1,-1,-1,0,-1],
  ["2026-07-08T04:02",1,-1,-1,-1,0,-1],
  ["2026-07-08T00:11",1,-1,-1,-1,0,-1],
  ["2026-07-07T18:21",0,0,5,1,-1,1],
  ["2026-07-07T18:18",0,2,7,0,-1,0],
  ["2026-07-07T16:59",0,0,2,0,-1,0],
  ["2026-07-07T14:00",1,-1,-1,-1,0,-1],
  ["2026-07-07T13:46",0,0,1,3,-1,4],
  ["2026-07-07T12:41",1,-1,-1,-1,0,-1],
  ["2026-07-07T11:10",0,0,0,0,-1,0],
  ["2026-07-07T10:37",0,0,3,3,-1,3],
  ["2026-07-07T08:47",1,-1,-1,-1,0,-1],
  ["2026-07-07T08:12",1,-1,-1,-1,0,-1],
  ["2026-07-06T18:16",0,0,3,0,-1,0],
  ["2026-07-06T17:35",1,-1,-1,-1,0,-1],
  ["2026-07-06T17:25",0,0,3,3,-1,4],
  ["2026-07-06T16:39",1,-1,-1,-1,0,-1],
  ["2026-07-06T15:54",0,0,6,3,-1,3],
  ["2026-07-06T15:25",1,-1,-1,-1,0,-1],
  ["2026-07-06T13:01",0,0,6,0,-1,0],
  ["2026-07-06T11:29",0,0,1,1,-1,1],
  ["2026-07-06T07:20",0,2,4,0,-1,0],
  ["2026-07-06T07:10",0,1,-1,0,-1,0],
  ["2026-07-05T23:31",0,0,3,3,-1,3],
  ["2026-07-05T23:28",0,2,7,5,-1,14],
  ["2026-07-05T13:17",1,-1,-1,-1,0,-1],
  ["2026-07-05T07:47",0,1,-1,3,-1,3],
  ["2026-07-05T05:01",1,-1,-1,-1,0,-1],
  ["2026-07-04T18:04",1,-1,-1,-1,0,-1],
  ["2026-07-04T10:45",1,-1,-1,-1,0,-1],
  ["2026-07-04T09:04",0,0,0,3,-1,3],
  ["2026-07-03T17:25",0,0,0,0,-1,0],
  ["2026-07-03T10:25",0,0,0,0,-1,0],
  ["2026-07-03T01:08",0,0,2,4,-1,5],
  ["2026-07-02T21:12",1,-1,-1,-1,0,-1],
  ["2026-07-02T16:05",0,1,-1,3,-1,3],
  ["2026-07-02T10:04",0,2,9,5,-1,14],
  ["2026-07-02T09:01",0,2,7,3,-1,3],
  ["2026-07-02T06:03",1,-1,-1,-1,0,-1],
  ["2026-07-02T04:59",1,-1,-1,-1,0,-1],
  ["2026-07-02T03:27",1,-1,-1,-1,0,-1],
  ["2026-07-01T22:13",1,-1,-1,-1,0,-1],
  ["2026-07-01T16:40",1,-1,-1,-1,0,-1],
  ["2026-07-01T10:59",1,-1,-1,-1,0,-1],
  ["2026-07-01T10:20",1,-1,-1,-1,0,-1],
  ["2026-06-30T17:19",0,0,0,0,-1,0],
  ["2026-06-30T17:12",0,0,0,0,-1,6],
  ["2026-06-30T15:04",1,-1,-1,-1,0,-1],
  ["2026-06-30T13:03",0,0,0,3,-1,4],
  ["2026-06-30T11:38",0,0,2,1,-1,1],
  ["2026-06-30T08:44",0,0,3,3,-1,4],
  ["2026-06-30T02:45",0,0,6,1,-1,1],
  ["2026-06-30T02:41",0,0,5,1,-1,1],
  ["2026-06-30T02:32",0,0,5,1,-1,1],
  ["2026-06-30T02:26",1,0,2,-1,2,-1],
  ["2026-06-29T18:57",1,-1,-1,-1,0,-1],
  ["2026-06-29T15:28",1,-1,-1,-1,0,-1],
  ["2026-06-28T18:45",0,2,7,0,-1,0],
  ["2026-06-28T16:50",0,1,-1,1,-1,1],
  ["2026-06-28T16:06",0,2,4,1,-1,1],
  ["2026-06-28T09:01",1,-1,-1,-1,0,-1],
  ["2026-06-28T01:40",1,-1,-1,-1,0,-1],
  ["2026-06-28T00:18",1,-1,-1,-1,0,-1],
  ["2026-06-27T19:33",1,-1,-1,-1,0,-1],
  ["2026-06-27T14:24",1,-1,-1,-1,0,-1],
  ["2026-06-27T12:37",1,-1,-1,-1,0,-1],
  ["2026-06-27T07:08",1,-1,-1,-1,0,-1],
  ["2026-06-27T03:26",1,-1,-1,-1,0,-1],
  ["2026-06-26T23:43",1,-1,-1,-1,0,-1],
  ["2026-06-26T19:06",0,0,6,3,-1,4],
  ["2026-06-26T16:23",1,-1,-1,-1,0,-1],
  ["2026-06-26T15:34",1,-1,-1,-1,0,-1],
  ["2026-06-26T13:17",0,0,1,0,-1,0],
  ["2026-06-26T11:30",0,2,7,1,-1,1],
  ["2026-06-26T11:22",2,0,6,-1,1,-1],
  ["2026-06-26T08:05",1,-1,-1,-1,0,-1],
  ["2026-06-25T20:27",1,-1,-1,-1,0,-1],
  ["2026-06-25T12:36",1,-1,-1,-1,0,-1],
  ["2026-06-25T12:06",1,-1,-1,-1,0,-1],
  ["2026-06-25T10:31",0,0,0,0,-1,11],
  ["2026-06-25T06:24",0,0,1,0,-1,0],
  ["2026-06-24T16:08",0,3,-1,1,-1,1],
  ["2026-06-24T04:39",0,0,1,0,-1,6],
  ["2026-06-23T08:55",0,0,5,0,-1,0],
  ["2026-06-22T20:38",0,0,3,0,-1,0],
  ["2026-06-22T14:17",0,0,1,3,-1,3],
  ["2026-06-22T13:53",0,3,-1,3,-1,3],
  ["2026-06-22T08:30",0,6,10,1,-1,1],
  ["2026-06-21T18:01",1,-1,-1,-1,0,-1],
  ["2026-06-21T07:00",1,-1,-1,-1,0,-1],
  ["2026-06-21T01:48",1,-1,-1,-1,0,-1],
  ["2026-06-20T23:12",1,-1,-1,-1,0,-1],
  ["2026-06-20T16:23",1,-1,-1,-1,0,-1],
  ["2026-06-20T13:30",1,-1,-1,-1,0,-1],
  ["2026-06-20T11:34",1,-1,-1,-1,0,-1],
  ["2026-06-20T09:53",1,-1,-1,-1,0,-1],
  ["2026-06-20T07:53",1,-1,-1,-1,0,-1],
  ["2026-06-20T06:41",1,-1,-1,-1,0,-1],
  ["2026-06-20T06:14",0,0,0,3,-1,3],
  ["2026-06-19T22:07",0,2,4,0,-1,0],
  ["2026-06-19T19:17",1,-1,-1,-1,0,-1],
  ["2026-06-19T15:08",0,0,6,3,-1,3],
  ["2026-06-19T14:03",0,0,1,0,-1,0],
  ["2026-06-19T12:55",0,0,5,1,-1,1],
  ["2026-06-19T12:48",0,0,6,0,-1,0],
  ["2026-06-19T10:55",0,0,3,0,-1,6],
  ["2026-06-19T09:46",1,-1,-1,-1,0,-1],
  ["2026-06-19T07:45",0,0,2,0,-1,0],
  ["2026-06-19T07:44",0,0,0,0,-1,6],
  ["2026-06-19T07:25",1,-1,-1,-1,0,-1],
  ["2026-06-19T07:15",1,-1,-1,-1,0,-1],
  ["2026-06-19T02:42",1,-1,-1,-1,0,-1],
  ["2026-06-19T00:13",1,-1,-1,-1,0,-1],
  ["2026-06-18T22:18",1,-1,-1,-1,0,-1],
  ["2026-06-18T17:36",0,1,-1,0,-1,6],
  ["2026-06-18T15:11",1,-1,-1,-1,0,-1],
  ["2026-06-18T12:18",1,-1,-1,-1,0,-1],
  ["2026-06-18T10:14",0,0,0,0,-1,0],
  ["2026-06-17T20:58",0,0,2,1,-1,1],
  ["2026-06-17T17:06",0,0,2,1,-1,1],
  ["2026-06-17T14:27",0,0,5,0,-1,0],
  ["2026-06-17T13:16",0,5,2,0,-1,0],
  ["2026-06-17T11:49",0,0,1,1,-1,1],
  ["2026-06-17T03:11",0,0,0,0,-1,0],
  ["2026-06-16T22:56",0,0,0,3,-1,4],
  ["2026-06-16T17:49",0,0,2,0,-1,0],
  ["2026-06-16T13:28",0,0,3,3,-1,4],
  ["2026-06-16T13:10",0,0,1,3,-1,3],
  ["2026-06-16T11:07",0,0,2,0,-1,0],
  ["2026-06-16T10:27",2,0,2,-1,1,-1],
  ["2026-06-16T10:21",2,0,2,-1,1,-1],
  ["2026-06-16T10:03",0,0,3,3,-1,3],
  ["2026-06-15T21:36",0,0,1,0,-1,6],
  ["2026-06-15T17:35",1,-1,-1,-1,0,-1],
  ["2026-06-15T13:34",1,-1,-1,-1,0,-1],
  ["2026-06-15T13:32",1,-1,-1,-1,0,-1],
  ["2026-06-15T12:32",1,-1,-1,-1,0,-1],
  ["2026-06-15T01:41",0,0,1,1,-1,1],
  ["2026-06-14T19:30",0,0,0,3,-1,3],
  ["2026-06-14T14:57",0,0,5,1,-1,1],
  ["2026-06-14T03:04",1,0,3,-1,3,-1],
  ["2026-06-14T01:48",0,0,0,0,-1,0],
  ["2026-06-13T13:45",0,0,0,0,-1,0],
  ["2026-06-13T08:09",1,-1,-1,-1,0,-1],
  ["2026-06-13T06:34",1,-1,-1,-1,0,-1],
  ["2026-06-13T05:14",0,0,1,1,-1,1],
  ["2026-06-12T22:39",0,0,3,3,-1,3],
  ["2026-06-12T15:29",0,7,-1,0,-1,0],
  ["2026-06-12T13:35",0,2,7,3,-1,3],
  ["2026-06-12T07:31",0,1,-1,1,-1,1],
  ["2026-06-12T07:30",0,1,-1,1,-1,1],
  ["2026-06-12T07:15",0,1,-1,1,-1,1],
  ["2026-06-12T00:38",1,-1,-1,-1,0,-1],
  ["2026-06-11T17:01",0,0,1,0,-1,0],
  ["2026-06-11T16:43",2,0,2,-1,1,-1],
  ["2026-06-11T16:41",2,0,2,-1,1,-1],
  ["2026-06-11T14:57",2,0,2,-1,1,-1],
  ["2026-06-11T14:12",0,0,1,0,-1,0],
  ["2026-06-11T13:50",0,2,7,0,-1,6],
  ["2026-06-11T13:27",0,0,1,3,-1,4],
  ["2026-06-11T10:59",0,0,1,0,-1,0],
  ["2026-06-11T10:53",2,1,-1,-1,1,-1],
  ["2026-06-11T06:59",1,-1,-1,-1,0,-1],
  ["2026-06-11T05:07",1,-1,-1,-1,0,-1],
  ["2026-06-10T21:27",0,1,-1,0,-1,0],
  ["2026-06-10T13:02",0,0,0,0,-1,0],
  ["2026-06-10T11:03",0,0,6,3,-1,4],
  ["2026-06-10T10:29",0,6,10,1,-1,1],
  ["2026-06-10T09:06",1,-1,-1,-1,0,-1],
  ["2026-06-10T07:18",0,2,7,3,-1,4],
  ["2026-06-10T06:28",0,3,-1,3,-1,4],
  ["2026-06-10T06:27",1,-1,-1,-1,0,-1],
  ["2026-06-10T02:45",0,2,7,3,-1,3],
  ["2026-06-10T02:00",1,-1,-1,-1,0,-1],
  ["2026-06-10T01:47",0,0,6,1,-1,1],
  ["2026-06-09T23:18",0,2,7,3,-1,3],
  ["2026-06-09T21:49",0,0,6,1,-1,1],
  ["2026-06-09T21:25",1,-1,-1,-1,0,-1],
  ["2026-06-09T20:18",0,0,1,1,-1,1],
  ["2026-06-09T20:10",0,0,3,0,-1,0],
  ["2026-06-09T19:03",0,6,10,1,-1,1],
  ["2026-06-09T16:29",0,0,1,1,-1,1],
  ["2026-06-09T16:25",0,0,1,1,-1,1],
  ["2026-06-09T15:23",2,0,6,-1,1,-1],
  ["2026-06-09T14:58",2,3,-1,-1,1,-1],
  ["2026-06-09T14:56",2,3,-1,-1,1,-1],
  ["2026-06-09T14:37",0,3,-1,1,-1,1],
  ["2026-06-09T13:49",0,6,10,1,-1,1],
  ["2026-06-09T12:00",0,1,-1,0,-1,0],
  ["2026-06-09T10:08",0,0,0,0,-1,0],
  ["2026-06-09T09:44",0,0,1,0,-1,0],
  ["2026-06-09T06:19",1,-1,-1,-1,0,-1],
  ["2026-06-09T06:08",1,-1,-1,-1,0,-1],
  ["2026-06-09T05:07",1,-1,-1,-1,0,-1],
  ["2026-06-09T05:07",1,-1,-1,-1,0,-1],
  ["2026-06-09T05:07",1,-1,-1,-1,0,-1],
  ["2026-06-09T02:38",1,-1,-1,-1,0,-1],
  ["2026-06-09T02:25",1,-1,-1,-1,0,-1],
  ["2026-06-09T01:59",1,-1,-1,-1,0,-1],
  ["2026-06-08T23:50",1,-1,-1,-1,0,-1],
  ["2026-06-08T22:32",0,0,0,3,-1,4],
  ["2026-06-08T21:52",1,-1,-1,-1,0,-1],
  ["2026-06-08T21:28",1,-1,-1,-1,0,-1],
  ["2026-06-08T20:12",1,-1,-1,-1,0,-1],
  ["2026-06-08T20:02",1,-1,-1,-1,0,-1],
  ["2026-06-08T19:50",1,-1,-1,-1,0,-1],
  ["2026-06-08T19:49",1,-1,-1,-1,0,-1],
  ["2026-06-08T19:48",1,-1,-1,-1,0,-1],
  ["2026-06-08T19:47",1,-1,-1,-1,0,-1],
  ["2026-06-08T19:09",1,-1,-1,-1,0,-1],
  ["2026-06-08T18:49",0,2,7,3,-1,3],
  ["2026-06-08T18:49",1,-1,-1,-1,0,-1],
  ["2026-06-08T18:48",1,-1,-1,-1,0,-1],
  ["2026-06-08T18:48",1,-1,-1,-1,0,-1],
  ["2026-06-08T18:46",1,-1,-1,-1,0,-1],
  ["2026-06-08T18:39",1,-1,-1,-1,0,-1],
  ["2026-06-08T17:41",1,-1,-1,-1,0,-1],
  ["2026-06-08T17:41",1,-1,-1,-1,0,-1],
  ["2026-06-08T16:10",0,0,5,0,-1,0],
  ["2026-06-08T15:35",0,0,6,1,-1,1],
  ["2026-06-08T15:09",0,4,11,1,-1,1],
  ["2026-06-08T14:26",1,-1,-1,-1,0,-1],
  ["2026-06-08T14:25",0,0,5,0,-1,11],
  ["2026-06-08T13:58",1,-1,-1,-1,0,-1],
  ["2026-06-08T13:46",0,0,1,3,-1,4],
  ["2026-06-08T13:39",0,6,10,1,-1,1],
  ["2026-06-08T13:13",1,-1,-1,-1,0,-1],
  ["2026-06-08T13:09",1,-1,-1,-1,0,-1],
  ["2026-06-08T13:04",0,6,10,1,-1,1],
  ["2026-06-08T12:49",1,-1,-1,-1,0,-1],
  ["2026-06-08T11:33",0,0,6,1,-1,1],
  ["2026-06-08T09:50",0,1,-1,1,-1,1],
  ["2026-06-08T09:39",0,6,10,1,-1,1],
  ["2026-06-08T09:37",0,6,10,1,-1,1],
  ["2026-06-08T06:57",0,2,9,3,-1,3],
  ["2026-06-07T10:03",1,-1,-1,-1,0,-1],
  ["2026-06-06T14:51",1,-1,-1,-1,0,-1],
  ["2026-06-06T02:55",1,-1,-1,-1,0,-1],
  ["2026-06-05T12:46",0,0,3,5,-1,7],
  ["2026-06-05T12:33",0,0,1,4,-1,5],
  ["2026-06-05T10:37",0,3,-1,3,-1,4],
  ["2026-06-04T22:07",1,-1,-1,-1,0,-1],
  ["2026-06-04T15:51",0,0,0,1,-1,1],
  ["2026-06-04T14:24",0,0,6,0,-1,0],
  ["2026-06-04T11:59",0,0,5,0,-1,0],
  ["2026-06-04T10:18",0,1,-1,0,-1,0],
  ["2026-06-04T08:30",0,5,0,0,-1,0],
  ["2026-06-04T00:25",1,-1,-1,-1,0,-1],
  ["2026-06-03T23:34",0,0,3,3,-1,4],
  ["2026-06-03T22:26",0,0,3,1,-1,1],
  ["2026-06-03T20:03",1,-1,-1,-1,0,-1],
  ["2026-06-03T18:49",0,0,1,3,-1,4],
  ["2026-06-03T17:42",1,-1,-1,-1,0,-1],
  ["2026-06-03T17:24",0,0,0,1,-1,1],
  ["2026-06-03T15:38",0,0,1,0,-1,0],
  ["2026-06-03T14:04",0,1,-1,0,-1,6],
  ["2026-06-03T13:51",1,-1,-1,-1,0,-1],
  ["2026-06-03T13:02",0,0,1,3,-1,3],
  ["2026-06-03T11:43",0,0,2,5,-1,8],
  ["2026-06-03T11:39",0,2,4,0,-1,10],
  ["2026-06-03T11:00",0,1,-1,0,-1,0],
  ["2026-06-03T09:16",1,-1,-1,-1,0,-1],
  ["2026-06-02T15:29",0,0,3,3,-1,3],
  ["2026-06-02T15:26",0,0,0,3,-1,3],
  ["2026-06-02T01:23",1,-1,-1,-1,0,-1],
  ["2026-06-01T18:00",0,0,0,3,-1,3],
  ["2026-06-01T14:27",0,0,3,3,-1,3],
  ["2026-06-01T11:09",0,0,3,1,-1,1],
  ["2026-06-01T09:56",0,1,-1,1,-1,1],
  ["2026-06-01T07:19",1,-1,-1,-1,0,-1],
  ["2026-06-01T06:19",1,-1,-1,-1,0,-1],
  ["2026-06-01T04:46",1,-1,-1,-1,0,-1],
  ["2026-06-01T02:34",1,-1,-1,-1,0,-1],
  ["2026-06-01T01:58",1,-1,-1,-1,0,-1],
  ["2026-05-31T19:18",1,-1,-1,-1,0,-1],
  ["2026-05-31T17:22",1,-1,-1,-1,0,-1],
  ["2026-05-31T13:05",1,-1,-1,-1,0,-1],
  ["2026-05-31T12:37",1,-1,-1,-1,0,-1],
  ["2026-05-31T09:54",1,-1,-1,-1,0,-1],
  ["2026-05-31T03:40",1,-1,-1,-1,0,-1],
  ["2026-05-30T20:03",1,-1,-1,-1,0,-1],
  ["2026-05-30T19:20",0,0,3,3,-1,4],
  ["2026-05-30T17:48",1,-1,-1,-1,0,-1],
  ["2026-05-30T14:18",1,-1,-1,-1,0,-1],
  ["2026-05-30T13:49",1,-1,-1,-1,0,-1],
  ["2026-05-30T10:58",1,-1,-1,-1,0,-1],
  ["2026-05-30T05:34",0,0,2,3,-1,4],
  ["2026-05-29T19:45",0,0,0,3,-1,3],
  ["2026-05-29T17:03",0,0,2,1,-1,1],
  ["2026-05-29T17:00",0,0,2,1,-1,1],
  ["2026-05-29T13:21",0,3,-1,1,-1,1],
  ["2026-05-29T05:24",0,2,4,1,-1,1],
  ["2026-05-29T02:06",1,-1,-1,-1,0,-1],
  ["2026-05-28T21:41",0,0,6,1,-1,1],
  ["2026-05-28T21:25",1,-1,-1,-1,0,-1],
  ["2026-05-28T20:35",0,2,4,1,-1,1],
  ["2026-05-28T16:33",0,0,0,1,-1,1],
  ["2026-05-28T11:11",1,-1,-1,-1,0,-1],
  ["2026-05-28T11:06",0,3,-1,3,-1,3],
  ["2026-05-28T10:32",0,0,3,1,-1,1],
  ["2026-05-28T09:26",1,-1,-1,-1,0,-1],
  ["2026-05-28T03:08",0,2,7,3,-1,3],
  ["2026-05-27T16:13",2,6,10,-1,1,-1],
  ["2026-05-27T16:13",2,0,2,-1,1,-1],
  ["2026-05-21T11:53",2,5,6,-1,1,-1],
  ["2026-05-19T09:34",2,6,10,-1,1,-1],
  ["2026-05-06T14:20",2,0,2,-1,1,-1],
  ["2026-05-06T14:06",2,0,6,-1,1,-1],
  ["2026-05-06T13:51",2,0,2,-1,1,-1],
  ["2026-05-06T13:29",2,0,2,-1,1,-1],
  ["2026-05-04T12:52",2,6,10,-1,1,-1],
  ["2026-05-04T11:56",2,3,-1,-1,1,-1],
  ["2026-04-30T14:49",2,0,2,-1,1,-1]
];

const pick = (list, i) => (i >= 0 ? list[i] : "");
const SEED_ENTRIES = SEED_ROWS.map((r, i) => {
  const day = r[0].slice(0, 10);
  const [y, m, d] = day.split("-").map(Number);
  return {
    id: "sample-" + (i + 1),
    dt: r[0],
    day,
    week: weekStart(new Date(y, m - 1, d)),
    klass: SEED_KLASS[r[1]],
    path: pick(SEED_PATHS, r[2]),
    cat: pick(SEED_CATS, r[3]),
    channel: pick(SEED_CHANNELS, r[4]),
    reason: pick(SEED_REASONS, r[5]),
    signal: pick(SEED_SIGNALS, r[6]),
    src: "",
    name: "", email: "", company: "", message: "",
  };
});

/* ================= presentation helpers ================= */
const API = "/api/forms";

const pctText = (v) => (v == null ? "\u2014" : Math.round(v * 100) + "%");
const prettyDay = (d) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const prettyDow = (d) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "short" });
};
const rangeText = (from, to) => (!from ? "All time" : from === to ? prettyDay(from) : `${prettyDay(from)} \u2013 ${prettyDay(to)}, ${to.slice(0, 4)}`);
const todayText = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return isoDay(x);
};

const csvCell = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
const toCSV = (rows) => rows.map((x) => x.map(csvCell).join(",")).join("\n");
function download(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CHANNEL_COLOR = {
  "Google Ads": "#F38637",
  "Organic Search": "#0598A6",
  "Email": "#90AD51",
  "LinkedIn": "#0598A6",
  "Paid Social": "#F38637",
  "AI Assistant": "#7A5FA8",
  "reLinkOnline": "#90AD51",
  "Referral": "#B08968",
  "Direct": "#2E2622",
  "Other": "#9A918B",
};

/* ================= storage ================= */
async function loadRemote() {
  const res = await fetch(API, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("load failed");
  return res.json();
}
async function saveRemote(payload) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Save failed.");
  return out;
}

/* ================= small pieces ================= */
const Kpi = ({ label, value, sub, tone }) => (
  <div className="ff-kpi">
    <span className="ff-kpi-label">{label}</span>
    <span className="ff-kpi-value" style={tone ? { color: tone } : undefined}>{value}</span>
    {sub && <span className="ff-kpi-sub">{sub}</span>}
  </div>
);

function Bars({ items, total, colorFor }) {
  if (!items.length) return <p className="ff-note">Nothing to show for this range.</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="ff-bars">
      {items.map((i) => (
        <div className="ff-barrow" key={i.label}>
          <span className="ff-barrow-name" title={i.label}>{i.label}</span>
          <span className="ff-barrow-track">
            <span style={{ width: `${(i.count / max) * 100}%`, background: colorFor ? colorFor(i.label) : "#0598A6" }} />
          </span>
          <span className="ff-barrow-val">
            {i.count}
            {total > 0 && <i>{Math.round((i.count / total) * 100)}%</i>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* Daily detail only reads at up to about a month. Past that the columns
   are thinner than their own labels, so Body switches to the weekly view
   instead of drawing this. Between two and four weeks the weekday name is
   dropped and every other date is hidden, which keeps the axis legible
   without shrinking the bars. */
const DAY_CHART_LIMIT = 31;

function DayChart({ days }) {
  if (!days.length) return null;
  const max = Math.max(...days.map((d) => d.lead + d.spam), 1);
  const avg = days.reduce((a, d) => a + d.lead, 0) / days.length;
  const dense = days.length > 14;
  const showEvery = days.length > 24 ? 3 : days.length > 14 ? 2 : 1;
  return (
    <div className="ff-panel">
      <div className={"ff-day-bars" + (dense ? " is-dense" : "")}>
        {days.map((d, i) => (
          <div className="ff-day-col" key={d.day} title={`${prettyDay(d.day)}: ${d.lead} leads, ${d.spam} spam`}>
            <span className="ff-day-stack">
              <span className="ff-day-spam" style={{ height: `${(d.spam / max) * 100}%` }} />
              <span className="ff-day-lead" style={{ height: `${(d.lead / max) * 100}%` }} />
            </span>
            {(!dense || d.lead > 0) && <span className="ff-day-num">{d.lead}</span>}
            <span className="ff-day-label">
              {i % showEvery === 0 ? (
                dense ? prettyDay(d.day) : <>{prettyDow(d.day)}<i>{d.day.slice(8)}</i></>
              ) : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="ff-legend">
        <span><i style={{ background: "#0598A6" }} />Genuine leads</span>
        <span><i style={{ background: "rgba(46,38,34,.22)" }} />Spam</span>
        <span className="ff-legend-avg">Average {avg.toFixed(1)} leads a day</span>
      </div>
    </div>
  );
}

function WeekChart({ weeks, stacked, lastDay }) {
  if (weeks.length < 2) return null;
  const max = Math.max(...weeks.map((w) => (stacked ? w.lead + w.spam : w.lead)), 1);
  const isPartial = (w) => Boolean(lastDay) && addDays(w.week, 6) > lastDay;
  /* The average ignores a half-finished trailing week and the quiet weeks
     before the first lead ever arrived. Including either understates it and
     puts the tab at odds with the weekly report. */
  const firstLive = weeks.findIndex((w) => w.lead > 0);
  const counted = firstLive < 0 ? [] : weeks.slice(firstLive).filter((w) => !isPartial(w));
  const avg = counted.length ? counted.reduce((a, w) => a + w.lead, 0) / counted.length : 0;
  const partials = weeks.filter(isPartial);
  const showEvery = weeks.length > 18 ? 2 : 1;
  return (
    <div className="ff-panel">
      <div className="ff-week-bars">
        {weeks.map((w, i) => (
          <div className="ff-week-col" key={w.week} title={`Week of ${prettyDay(w.week)}: ${w.lead} leads, ${w.spam} spam`}>
            <span className={"ff-week-stack" + (isPartial(w) ? " is-partial" : "")}>
              {stacked && <span className="ff-week-spam" style={{ height: `${(w.spam / max) * 100}%` }} />}
              <span className="ff-week-lead" style={{ height: `${(w.lead / max) * 100}%`, opacity: i === weeks.length - 1 && !isPartial(w) ? 1 : 0.55 }} />
            </span>
            <span className="ff-week-num">{w.lead}</span>
            <span className="ff-week-label">{i % showEvery === 0 ? prettyDay(w.week) : ""}</span>
          </div>
        ))}
      </div>
      <div className="ff-legend">
        <span><i style={{ background: "#F38637" }} />Genuine leads</span>
        {stacked && <span><i style={{ background: "rgba(46,38,34,.22)" }} />Spam</span>}
        <span className="ff-legend-avg">Average {avg.toFixed(1)} leads a week</span>
      </div>
      {partials.length > 0 && (
        <p className="ff-note">
          Week of {prettyDay(partials[0].week)} is still in progress &mdash; marked with a dotted cap, and left out of the average.
        </p>
      )}
    </div>
  );
}

/* ================= import ================= */
function ImportModal({ onClose, onApply }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    setFilename(file.name);
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const out = parseEntries(decodeBuffer(reader.result));
        if (out.error) setError(out.error);
        else setResult(out);
      } catch (err) {
        setError("That file couldn't be read. Try re-downloading it from WPForms.");
      }
    };
    reader.onerror = () => setError("That file couldn't be read. Try re-downloading it.");
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="ff-modal-wrap" onClick={onClose}>
      <div className="ff-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import form entries">
        <button className="ff-modal-x" onClick={onClose} aria-label="Close">&times;</button>
        <p className="ff-crumb">Data</p>
        <h2 className="ff-modal-title">Import form entries</h2>
        <p className="ff-modal-sub">
          Drop the raw WPForms #11986 export. Classification runs here in the browser &mdash;
          nothing is sent anywhere until you publish.
        </p>

        <div
          className={"ff-drop" + (drag ? " is-over" : "")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => handleFile(e.target.files[0])} />
          <p className="ff-drop-main">{filename || "Drop the export here, or choose a file"}</p>
          <p className="ff-drop-sub">Needs Entry Date, Email, Source URL, Path Label and User Journey information</p>
        </div>

        {error && <div className="ff-alert is-bad">{error}</div>}

        {result && (
          <div className="ff-alert is-good">
            <strong>
              {result.stats.leads.toLocaleString()} genuine leads, {result.stats.spam.toLocaleString()} spam,{" "}
              {result.stats.tests.toLocaleString()} internal tests.
            </strong>
            <span>
              {result.stats.total.toLocaleString()} dated entries, {prettyDay(result.stats.first)} to {prettyDay(result.stats.last)}.
              {result.stats.undated > 0 && ` ${result.stats.undated} row${result.stats.undated === 1 ? "" : "s"} had no readable date and were left out.`}
            </span>
            {result.missing.length > 0 && (
              <span className="ff-alert-warn">
                Missing {result.missing.join(", ")} &mdash; classification and channel attribution get less reliable without{" "}
                {result.missing.length === 1 ? "it" : "them"}.
              </span>
            )}
          </div>
        )}

        <div className="ff-modal-actions">
          <button className="ff-btn is-ghost" onClick={onClose}>Cancel</button>
          <button className="ff-btn" disabled={!result} onClick={() => result && onApply(result, filename)}>Load entries</button>
        </div>
      </div>
    </div>
  );
}

/* ================= publish ================= */
function PublishModal({ onClose, onDone, entries, period, saves }) {
  const [key, setKey] = useState("");
  const [by, setBy] = useState("");
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    const payload = entries.map((e) =>
      detail ? e : { ...e, name: "", email: "", message: "" }
    );
    try {
      const out = await saveRemote({ key, by, period, detail, entries: payload });
      onDone({ savedAt: new Date().toISOString(), by, detail }, out, payload);
    } catch (err) {
      setError(err.message || "Save failed.");
      setBusy(false);
    }
  };

  return (
    <div className="ff-modal-wrap" onClick={onClose}>
      <div className="ff-modal is-narrow" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Publish to the team">
        <button className="ff-modal-x" onClick={onClose} aria-label="Close">&times;</button>
        <p className="ff-crumb">Publish</p>
        <h2 className="ff-modal-title">Save this to the team</h2>
        <p className="ff-modal-sub">Everyone opening this tab sees these entries next.</p>

        <label className="ff-field">
          <span>Your name <i>optional</i></span>
          <input type="text" value={by} placeholder="Joe" onChange={(e) => setBy(e.target.value)} />
        </label>
        <label className="ff-field">
          <span>Write passphrase</span>
          <input
            type="password"
            value={key}
            placeholder="Same one the grid uses"
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && key && !busy) go(); }}
          />
        </label>

        <label className="ff-check">
          <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} />
          <span>
            <b>Include names, emails and messages</b>
            <i>
              Off by default. This site has no login, so anyone with the URL can read what gets
              published. Leave it off and counts, paths and channels still publish in full &mdash;
              only the contact details stay on your machine.
            </i>
          </span>
        </label>

        {error && <div className="ff-alert is-bad">{error}</div>}

        <p className="ff-modal-fine">
          {entries.length.toLocaleString()} classified entries.
          {saves > 0 && ` ${saves} save${saves === 1 ? "" : "s"} so far.`}
        </p>
        <div className="ff-modal-actions">
          <button className="ff-btn is-ghost" onClick={onClose}>Cancel</button>
          <button className="ff-btn" disabled={!key || busy} onClick={go}>{busy ? "Saving\u2026" : "Publish"}</button>
        </div>
      </div>
    </div>
  );
}

/* ================= one entry, in full ================= */
function DetailDrawer({ entry, onClose, onPrev, onNext, position }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" || e.key === "ArrowRight") onNext();
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  if (!entry) return null;
  const withheld = !entry.name && !entry.email && !entry.message;
  const KL = { lead: "Genuine lead", spam: "Spam", test: "Internal test" };
  const tone = entry.klass === "lead" ? "#90AD51" : entry.klass === "spam" ? "#F38637" : "#0598A6";

  return (
    <>
      <div className="ff-scrim" onClick={onClose} />
      <aside className="ff-drawer" role="dialog" aria-label="Entry detail">
        <button className="ff-drawer-x" onClick={onClose} aria-label="Close">&times;</button>
        <div className="ff-drawer-inner">
          <p className="ff-crumb">
            <span style={{ color: tone }}>{KL[entry.klass]}</span>
            {position && <i className="ff-pos">{position}</i>}
          </p>
          <h2 className="ff-drawer-title">{entry.name || (withheld ? "Contact details withheld" : "No name given")}</h2>
          <p className="ff-drawer-sub">
            {prettyDay(entry.day)}, {entry.dt.slice(11)} &middot; {prettyDow(entry.day)} &middot; entry {entry.id}
          </p>

          <div className="ff-nav">
            <button className="ff-btn is-ghost ff-btn-sm" onClick={onPrev}>&larr; Newer</button>
            <button className="ff-btn is-ghost ff-btn-sm" onClick={onNext}>Older &rarr;</button>
          </div>

          {withheld && (
            <div className="ff-alert is-info">
              <strong>This entry has no contact details attached.</strong>
              <span>
                The built-in sample and anything published without the detail box ticked carry the
                shape of each submission but not the person. Import the WPForms export in this tab
                and the names, emails and messages appear.
              </span>
            </div>
          )}

          <h3 className="ff-h3">The request</h3>
          <div className="ff-facts">
            <div><span>Path</span><b>{entry.path || "\u2014"}</b></div>
            <div><span>Category</span><b>{entry.cat || "\u2014"}</b></div>
            {entry.company && <div><span>Company</span><b>{entry.company}</b></div>}
          </div>

          {entry.klass === "lead" && (
            <>
              <h3 className="ff-h3">Where it came from</h3>
              <div className="ff-attrib">
                <span className="ff-chan is-big" style={{ "--c": CHANNEL_COLOR[entry.channel] || "#0598A6" }}>
                  {entry.channel || "\u2014"}
                </span>
                {entry.signal && <p className="ff-why">Decided on: {entry.signal}.</p>}
                {entry.src && <p className="ff-src">{entry.src}</p>}
              </div>
            </>
          )}

          {entry.klass === "spam" && (
            <>
              <h3 className="ff-h3">Why it was filtered</h3>
              <p className="ff-why">{entry.reason}</p>
            </>
          )}

          {entry.email && (
            <>
              <h3 className="ff-h3">Contact</h3>
              <div className="ff-facts">
                <div><span>Email</span><b><a href={`mailto:${entry.email}`}>{entry.email}</a></b></div>
              </div>
            </>
          )}

          {entry.message && (
            <>
              <h3 className="ff-h3">What they wrote</h3>
              <p className="ff-message">{entry.message}</p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/* ================= main ================= */
export default function FormFills() {
  const [entries, setEntries] = useState(SEED_ENTRIES);
  const [usingSeed, setUsingSeed] = useState(true);
  const [meta, setMeta] = useState(null);
  const [online, setOnline] = useState(null);
  const [saves, setSaves] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [redacted, setRedacted] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [preset, setPreset] = useState("week");
  const [custom, setCustom] = useState(null);
  const [tableView, setTableView] = useState("lead");
  const [query, setQuery] = useState("");
  const [chanFilter, setChanFilter] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [openIdx, setOpenIdx] = useState(null);

  useEffect(() => {
    let dead = false;
    loadRemote()
      .then((out) => {
        if (dead) return;
        setOnline(true);
        setSaves(out.saves || 0);
        if (out.data?.entries?.length) {
          setEntries(out.data.entries);
          setUsingSeed(false);
          setRedacted(!out.data.detail);
          setMeta({ savedAt: out.data.savedAt, by: out.data.by, period: out.data.period });
        }
      })
      .catch(() => { if (!dead) setOnline(false); });
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setShowImport(false); setShowPublish(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const weeks = useMemo(() => [...new Set(entries.map((e) => e.week))].sort(), [entries]);
  const daySpan = useMemo(() => {
    const d = entries.map((e) => e.day).sort();
    return d.length ? [d[0], d[d.length - 1]] : [null, null];
  }, [entries]);

  /* The last week the data actually covers end to end. */
  const anchorWeek = useMemo(() => {
    if (!weeks.length) return null;
    const lastDay = daySpan[1];
    const complete = weeks.filter((w) => addDays(w, 6) <= lastDay);
    return complete.length ? complete[complete.length - 1] : weeks[weeks.length - 1];
  }, [weeks, daySpan]);

  const [from, to] = useMemo(() => {
    if (!weeks.length) return [null, null];
    if (custom) {
      const a = custom.from, b = custom.to;
      return a <= b ? [a, b] : [b, a];
    }
    if (preset === "all") return [null, null];
    const last = anchorWeek;
    const end = addDays(last, 6);
    if (preset === "week") return [last, end];
    const n = preset === "4" ? 4 : 8;
    const i = weeks.indexOf(last);
    return [weeks[Math.max(0, (i < 0 ? weeks.length - 1 : i) - (n - 1))], end];
  }, [weeks, preset, custom, anchorWeek]);

  const s = useMemo(() => summarise(entries, from, to), [entries, from, to]);
  const period = from ? rangeText(from, to) : daySpan[0] ? rangeText(daySpan[0], daySpan[1]) : "All time";

  /* Options come from what is actually in range, so the dropdowns never
     offer a filter that returns nothing. */
  const chanOptions = useMemo(() => [...new Set(s.rows.map((e) => e.channel).filter(Boolean))].sort(), [s]);
  const pathOptions = useMemo(() => [...new Set(s.rows.map((e) => e.path).filter(Boolean))].sort(), [s]);

  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = s.rows.filter((e) => {
      if (tableView !== "all" && e.klass !== tableView) return false;
      if (chanFilter && e.channel !== chanFilter) return false;
      if (pathFilter && e.path !== pathFilter) return false;
      if (q) {
        const hay = [e.name, e.email, e.company, e.message, e.path, e.cat, e.channel, e.reason]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return list.sort((a, b) => (a.dt < b.dt ? 1 : -1));
  }, [s, tableView, query, chanFilter, pathFilter]);

  const filtered = Boolean(query.trim() || chanFilter || pathFilter);
  const clearFilters = () => { setQuery(""); setChanFilter(""); setPathFilter(""); };

  /* The drawer walks the filtered list, so Older/Newer stay inside
     whatever the person is currently looking at. */
  const shown = tableRows.slice(0, 250);
  const openEntry = openIdx == null ? null : shown[openIdx] || null;
  const step = (n) => setOpenIdx((i) => (i == null ? null : Math.max(0, Math.min(shown.length - 1, i + n))));

  useEffect(() => { setOpenIdx(null); }, [tableView, query, chanFilter, pathFilter, from, to]);

  const applyImport = (out, name) => {
    setEntries(out.entries);
    setUsingSeed(false);
    setRedacted(false);
    setDirty(true);
    setShowImport(false);
    setCustom(null);
    setPreset("week");
    setMeta((m) => ({ ...(m || {}), period: `Imported from ${name}` }));
  };

  const exportCSV = () => {
    const rows = [["Entry ID", "Date", "Classification", "Reason", "Channel", "Path", "Category", "Name", "Email", "Company", "Message"]];
    s.rows.forEach((e) => {
      rows.push([e.id, e.dt.replace("T", " "), e.klass, e.reason, e.channel, e.path, e.cat, e.name, e.email, e.company, (e.message || "").replace(/\s+/g, " ").slice(0, 400)]);
    });
    download(`form-fills-${from || daySpan[0] || "all"}.csv`, toCSV(rows));
  };

  const hasData = entries.length > 0;

  const Body = ({ print }) => (
    <>
      <div className="ff-kpis">
        <Kpi label="Genuine leads" value={s.counts.lead.toLocaleString()} sub={s.days.length ? `${(s.counts.lead / s.days.length).toFixed(1)} a day` : null} />
        <Kpi label="Signal quality" value={pctText(s.quality)} sub={`${s.counts.total.toLocaleString()} submissions`} tone={s.quality != null && s.quality < 0.5 ? "#F38637" : "#90AD51"} />
        <Kpi label="Spam" value={s.counts.spam.toLocaleString()} sub="filtered out" />
        <Kpi label="Internal tests" value={s.counts.test.toLocaleString()} sub="excluded from leads" />
      </div>

      {s.days.length <= DAY_CHART_LIMIT ? (
        <>
          <h3 className="ff-h3">Submissions by day</h3>
          <DayChart days={s.days} />
          {s.weeks.length > 1 && (
            <>
              <h3 className="ff-h3">Leads by week</h3>
              <WeekChart weeks={s.weeks} lastDay={daySpan[1]} />
            </>
          )}
        </>
      ) : (
        <>
          <h3 className="ff-h3">Submissions by week</h3>
          <WeekChart weeks={s.weeks} stacked lastDay={daySpan[1]} />
          <p className="ff-note">
            {s.days.length} days in range &mdash; too many to read one bar at a time, so this is by week.
            Pick a shorter period for the daily view.
          </p>
        </>
      )}

      <div className="ff-two">
        <div>
          <h3 className="ff-h3">Where leads came from</h3>
          <Bars items={s.channels} total={s.counts.lead} colorFor={(l) => CHANNEL_COLOR[l] || "#0598A6"} />
        </div>
        <div>
          <h3 className="ff-h3">What they asked for</h3>
          <Bars items={s.paths} total={s.counts.lead} />
        </div>
      </div>

      {s.cats.length > 0 && (
        <>
          <h3 className="ff-h3">Equipment categories</h3>
          <Bars items={s.cats.slice(0, print ? 12 : 8)} total={s.counts.lead} colorFor={() => "#90AD51"} />
        </>
      )}

      {s.counts.spam > 0 && (
        <>
          <h3 className="ff-h3">Why {s.counts.spam} were filtered</h3>
          <Bars items={s.reasons} total={s.counts.spam} colorFor={() => "rgba(46,38,34,.35)"} />
        </>
      )}

      {!print && (
        <>
          <h3 className="ff-h3">Entries</h3>
          <div className="ff-pills">
            {[
              { k: "lead", label: `Leads (${s.counts.lead})` },
              { k: "spam", label: `Spam (${s.counts.spam})` },
              { k: "test", label: `Tests (${s.counts.test})` },
              { k: "all", label: `All (${s.counts.total})` },
            ].map((p) => (
              <button key={p.k} className={"ff-pill" + (tableView === p.k ? " is-on" : "")} onClick={() => setTableView(p.k)} aria-pressed={tableView === p.k}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="ff-filters">
            <input
              className="ff-search"
              type="search"
              value={query}
              placeholder="Search name, company, message, category&hellip;"
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search entries"
            />
            <select className="ff-sel" value={chanFilter} onChange={(e) => setChanFilter(e.target.value)} aria-label="Filter by channel">
              <option value="">All channels</option>
              {chanOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="ff-sel" value={pathFilter} onChange={(e) => setPathFilter(e.target.value)} aria-label="Filter by path">
              <option value="">All paths</option>
              {pathOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {filtered && <button className="ff-btn is-ghost ff-btn-sm" onClick={clearFilters}>Clear</button>}
            <span className="ff-count">
              {tableRows.length.toLocaleString()}
              {filtered ? ` of ${s.counts.total.toLocaleString()}` : ""} shown
            </span>
          </div>

          {redacted && !usingSeed && tableView !== "spam" && (
            <p className="ff-note">
              This was published without contact details, so names and emails aren&rsquo;t here.
              Import the export again to see them.
            </p>
          )}
          <table className="ff-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="ff-l">Who</th>
                <th className="ff-l">Path</th>
                <th className="ff-l">{tableView === "spam" ? "Reason" : "Channel"}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e, i) => (
                <tr key={e.id + e.dt} className="ff-tr" tabIndex={0} role="button"
                  onClick={() => setOpenIdx(i)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpenIdx(i); } }}>
                  <td className="ff-mono">{prettyDay(e.day)}<i>{e.dt.slice(11)}</i></td>
                  <td className="ff-l">
                    <b>{e.name || "\u2014"}</b>
                    {e.company && <i>{e.company}</i>}
                  </td>
                  <td className="ff-l">{e.path || "\u2014"}{e.cat && <i>{e.cat}</i>}</td>
                  <td className="ff-l">
                    {tableView === "spam" ? (
                      <span className="ff-reason">{e.reason}</span>
                    ) : (
                      <span className="ff-chan" style={{ "--c": CHANNEL_COLOR[e.channel] || "#0598A6" }}>{e.channel || "\u2014"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tableRows.length > 250 && <p className="ff-note">Showing the 250 most recent of {tableRows.length.toLocaleString()}. Narrow the filters, or export CSV for the rest.</p>}
          {tableRows.length === 0 && (
            <p className="ff-note">
              {filtered ? "Nothing matches those filters in this range." : "Nothing in this bucket for the selected range."}
            </p>
          )}
        </>
      )}
    </>
  );

  return (
    <>
      <style>{FF_CSS}</style>
      <div className="ff-root">
        <header className="ff-head">
          <div>
            <p className="ff-eyebrow">reLink &middot; contact wizard</p>
            <h1 className="ff-title">Form <span>Fills</span></h1>
            <p className="ff-sub">
              WPForms #11986, classified into genuine leads, spam and internal tests, then attributed
              by UTM and referrer.
            </p>
          </div>
          <div className="ff-head-right">
            <div className="ff-head-btns">
              <button className="ff-btn" onClick={() => setShowImport(true)}>Import CSV</button>
              {hasData && <button className="ff-btn is-ghost" onClick={() => window.print()}>Download PDF</button>}
              {hasData && <button className="ff-btn is-ghost" onClick={exportCSV}>Export CSV</button>}
            </div>
            {hasData && (
              <div className="ff-tally">
                <div className="ff-tally-item"><span className="ff-tally-num">{s.counts.lead.toLocaleString()}</span><span className="ff-tally-label">Leads</span></div>
                <div className="ff-tally-item"><span className="ff-tally-num">{pctText(s.quality)}</span><span className="ff-tally-label">Signal quality</span></div>
                <div className="ff-tally-item"><span className="ff-tally-num" style={{ color: "#F38637" }}>{s.counts.spam.toLocaleString()}</span><span className="ff-tally-label">Spam</span></div>
              </div>
            )}
          </div>
        </header>

        {hasData && (
          <div className="ff-range">
            <span className="ff-range-label">Report period</span>
            <div className="ff-pills">
              {[
                { k: "week", label: "Latest week" },
                { k: "4", label: "Last 4 weeks" },
                { k: "8", label: "Last 8 weeks" },
                { k: "all", label: "All time" },
              ].filter((p) => p.k !== "8" || weeks.length > 4).map((p) => (
                <button key={p.k} className={"ff-pill" + (!custom && preset === p.k ? " is-on" : "")} onClick={() => { setCustom(null); setPreset(p.k); }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="ff-range-dates">
              <input type="date" value={from || daySpan[0] || ""} min={daySpan[0] || undefined} max={daySpan[1] || undefined}
                onChange={(e) => setCustom({ from: e.target.value, to: to || daySpan[1] })} aria-label="From date" />
              <span className="ff-dash">&ndash;</span>
              <input type="date" value={to || daySpan[1] || ""} min={daySpan[0] || undefined} max={daySpan[1] || undefined}
                onChange={(e) => setCustom({ from: from || daySpan[0], to: e.target.value })} aria-label="To date" />
            </div>
            <span className="ff-range-note">{period}</span>
          </div>
        )}

        <div className="ff-status">
          {online === false ? (
            <span className="ff-status-note">Storage isn&rsquo;t reachable, so nothing can be published from here.</span>
          ) : dirty ? (
            <>
              <span className="ff-status-note is-warn">Loaded but not published. Only you can see this.</span>
              <button className="ff-btn ff-btn-sm" onClick={() => setShowPublish(true)}>Publish to team</button>
            </>
          ) : meta?.savedAt ? (
            <span className="ff-status-note">
              Published {new Date(meta.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {meta.by ? ` by ${meta.by}` : ""}
              {saves > 1 ? ` \u00b7 ${saves} saves` : ""}
              {redacted ? " \u00b7 contact details withheld" : ""}
            </span>
          ) : usingSeed ? (
            <span className="ff-status-note">
              Built-in sample through Aug 17 &mdash; shape only, no names or emails. Import an export to replace it.
            </span>
          ) : online ? (
            <span className="ff-status-note">Nothing published yet. Import an export, then publish it.</span>
          ) : (
            <span className="ff-status-note">Checking for saved data&hellip;</span>
          )}
        </div>

        {hasData ? (
          <div className="ff-body"><Body /></div>
        ) : (
          <div className="ff-empty">
            <h2>No entries loaded</h2>
            <p>
              Export the entries from <b>WPForms &rarr; Entries &rarr; Contact Wizard (#11986)</b> and drop the
              CSV in. Everything is classified in the browser; nothing leaves your machine until you publish.
            </p>
            <button className="ff-btn" onClick={() => setShowImport(true)}>Import CSV</button>
          </div>
        )}
      </div>

      {hasData && (
        <div className="ff-print" aria-hidden="true">
          <div className="ff-print-head">
            <div>
              <p className="ff-print-brand">reLink Medical &middot; Form Fills</p>
              <h1>Contact wizard leads</h1>
              <p className="ff-print-crumb">WPForms #11986 &middot; classified and attributed</p>
            </div>
            <div className="ff-print-meta"><span>{period}</span><span>Generated {todayText()}</span></div>
          </div>
          <Body print />
          <p className="ff-print-foot">
            reLink Medical &middot; Twinsburg, Ohio &middot; {period} &middot; Generated {todayText()} &middot;
            Spam identified by direct-endpoint fingerprint, sender domain and message pattern
          </p>
        </div>
      )}

      {openEntry && (
        <DetailDrawer
          entry={openEntry}
          position={`${openIdx + 1} of ${shown.length}`}
          onClose={() => setOpenIdx(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} onApply={applyImport} />}
      {showPublish && (
        <PublishModal
          entries={entries}
          period={period}
          saves={saves}
          onClose={() => setShowPublish(false)}
          onDone={(m, out, payload) => {
            setMeta(m);
            setDirty(false);
            setShowPublish(false);
            setSaves((n) => n + 1);
            if (!m.detail) { setEntries(payload); setRedacted(true); }
          }}
        />
      )}
    </>
  );
}

const FF_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

.ff-root{--esp:#2E2622;--cream:#FAF7F1;--orange:#F38637;--teal:#0598A6;--olive:#90AD51;--line:rgba(46,38,34,.12);--mute:rgba(46,38,34,.55);
  min-height:100vh;box-sizing:border-box;padding:34px 28px 60px;background:var(--cream);color:var(--esp);
  font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.ff-root *,.ff-root *::before,.ff-root *::after{box-sizing:border-box}
.ff-body,.ff-head,.ff-range,.ff-status,.ff-empty{max-width:1180px;margin-left:auto;margin-right:auto}

.ff-head{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;flex-wrap:wrap;margin-bottom:22px}
.ff-head-right{display:flex;flex-direction:column;align-items:flex-end;gap:16px}
.ff-head-btns{display:flex;gap:8px;flex-wrap:wrap}
.ff-eyebrow{margin:0 0 10px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--teal)}
.ff-title{margin:0;font-size:clamp(34px,5vw,50px);font-weight:300;letter-spacing:-.025em;line-height:1}
.ff-title span{font-weight:700;color:var(--orange)}
.ff-sub{margin:12px 0 0;max-width:52ch;font-size:15px;line-height:1.5;color:var(--mute)}
.ff-tally{display:flex;gap:28px}
.ff-tally-item{display:flex;flex-direction:column}
.ff-tally-num{font-size:28px;font-weight:700;line-height:1;letter-spacing:-.03em}
.ff-tally-label{margin-top:6px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.42)}

.ff-btn{padding:9px 20px;border:none;border-radius:999px;background:#F38637;color:#fff;font-family:'Source Sans 3',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .16s ease,opacity .16s ease}
.ff-btn:hover{background:#e0752a}
.ff-btn:disabled{opacity:.35;cursor:not-allowed}
.ff-btn.is-ghost{background:transparent;border:1px solid rgba(46,38,34,.18);color:rgba(46,38,34,.7)}
.ff-btn.is-ghost:hover{border-color:#2E2622;color:#2E2622}
.ff-btn-sm{padding:6px 15px;font-size:12.5px}
.ff-btn:focus-visible,.ff-pill:focus-visible,.ff-drop:focus-visible,.ff-modal-x:focus-visible{outline:2px solid #0598A6;outline-offset:2px}

.ff-range{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;padding:12px 16px;border:1px solid var(--line);border-radius:12px;background:#fff}
.ff-range-label{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.42)}
.ff-range-dates{display:flex;align-items:center;gap:7px}
.ff-range-dates input{padding:6px 9px;border:1px solid rgba(46,38,34,.16);border-radius:7px;background:#FAF7F1;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:#2E2622;cursor:pointer}
.ff-range-dates input:focus{outline:none;border-color:#0598A6;box-shadow:0 0 0 3px rgba(5,152,166,.15)}
.ff-dash{color:rgba(46,38,34,.3)}
.ff-range-note{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.04em;color:rgba(46,38,34,.4)}
.ff-pills{display:flex;gap:5px;flex-wrap:wrap}
.ff-pill{padding:6px 14px;border:1px solid rgba(46,38,34,.14);border-radius:999px;background:#fff;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--mute);cursor:pointer;transition:all .16s ease}
.ff-pill:hover{border-color:#0598A6;color:#0598A6}
.ff-pill.is-on{background:var(--esp);border-color:var(--esp);color:var(--cream)}

.ff-status{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:22px}
.ff-status-note{font-size:12.5px;color:rgba(46,38,34,.45)}
.ff-status-note.is-warn{color:#8A4A16;font-weight:600}

.ff-empty{padding:52px 32px;border:1px dashed rgba(46,38,34,.2);border-radius:16px;background:#fff;text-align:center}
.ff-empty h2{margin:0 0 10px;font-size:22px;font-weight:700;letter-spacing:-.02em}
.ff-empty p{margin:0 auto 20px;max-width:54ch;font-size:14.5px;line-height:1.55;color:var(--mute)}

.ff-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.ff-kpi{padding:15px 16px;border:1px solid var(--line);border-radius:12px;background:#fff;display:flex;flex-direction:column}
.ff-kpi-label{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.42)}
.ff-kpi-value{margin-top:8px;font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1}
.ff-kpi-sub{margin-top:6px;font-size:11.5px;color:rgba(46,38,34,.45)}

.ff-h3{margin:32px 0 12px;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.ff-panel{padding:18px 18px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden}
.ff-day-bars{display:flex;align-items:flex-end;justify-content:center;gap:6px;height:170px;min-width:0}
.ff-day-bars.is-dense{gap:3px}
.ff-day-bars.is-dense .ff-day-num{font-size:9px}
.ff-day-bars.is-dense .ff-day-label{font-size:8px;white-space:nowrap;transform:rotate(-45deg);transform-origin:top center;height:14px}
.ff-day-col{flex:1 1 0;min-width:0;max-width:110px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
.ff-day-stack{display:flex;flex-direction:column-reverse;justify-content:flex-start;width:100%;flex:1;min-height:0}
.ff-day-lead{width:100%;background:#0598A6;border-radius:3px 3px 0 0;min-height:2px}
.ff-day-spam{width:100%;background:rgba(46,38,34,.22)}
.ff-day-num{margin-top:6px;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:500}
.ff-day-label{margin-top:2px;text-align:center;font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:rgba(46,38,34,.4)}
.ff-day-label i{display:block;font-style:normal;color:rgba(46,38,34,.3)}
.ff-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:22px;padding-top:12px;border-top:1px solid var(--line);font-size:11.5px;color:rgba(46,38,34,.5)}
.ff-legend span{display:flex;align-items:center;gap:6px}
.ff-legend i{width:10px;height:10px;border-radius:3px;display:block}
.ff-legend-avg{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:rgba(46,38,34,.4)}

.ff-week-bars{display:flex;align-items:flex-end;justify-content:center;gap:6px;height:170px;min-width:0}
.ff-week-col{flex:1 1 0;min-width:0;max-width:110px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
.ff-week-stack{display:flex;flex-direction:column-reverse;justify-content:flex-start;width:100%;flex:1;min-height:0}
.ff-week-lead{width:100%;background:#F38637;border-radius:3px 3px 0 0;min-height:2px}
.ff-week-spam{width:100%;background:rgba(46,38,34,.22)}
.ff-week-stack.is-partial .ff-week-lead,.ff-week-stack.is-partial .ff-week-spam{
  background-image:repeating-linear-gradient(45deg,rgba(250,247,241,.65),rgba(250,247,241,.65) 3px,transparent 3px,transparent 6px)}
.ff-week-stack.is-partial::before{content:'';display:block;width:100%;border-top:2px dotted rgba(46,38,34,.3);margin-bottom:2px}
.ff-week-num{margin-top:6px;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:500}
.ff-week-label{margin-top:2px;font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:rgba(46,38,34,.4);white-space:nowrap;transform:rotate(-45deg);transform-origin:top center;height:14px}

.ff-two{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.ff-bars{display:flex;flex-direction:column;gap:6px}
.ff-barrow{display:grid;grid-template-columns:minmax(96px,150px) 1fr 62px;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#fff}
.ff-barrow-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-barrow-track{height:8px;border-radius:4px;background:rgba(46,38,34,.07);overflow:hidden}
.ff-barrow-track span{display:block;height:100%;border-radius:4px;min-width:2px}
.ff-barrow-val{text-align:right;font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:500}
.ff-barrow-val i{display:block;font-style:normal;font-size:9px;color:rgba(46,38,34,.4)}

.ff-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
.ff-table th{text-align:right;padding:0 10px 8px 0;font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:rgba(46,38,34,.4);border-bottom:1px solid var(--line)}
.ff-table th.ff-l{text-align:left}
.ff-table td{padding:10px 10px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}
.ff-table td.ff-l{text-align:left}
.ff-table td b{font-weight:600;display:block}
.ff-table td i{display:block;margin-top:2px;font-style:normal;font-size:11px;color:rgba(46,38,34,.45)}
.ff-mono{font-family:'IBM Plex Mono',monospace;font-size:11.5px;white-space:nowrap;color:rgba(46,38,34,.65)}
.ff-chan{display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid var(--c);color:var(--c);font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.ff-reason{font-size:12px;color:rgba(46,38,34,.5);line-height:1.35}
.ff-note{margin:12px 0 0;font-size:12px;line-height:1.45;color:rgba(46,38,34,.45)}

/* ---------- filters ---------- */
.ff-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
.ff-search{flex:1 1 240px;min-width:180px;padding:8px 13px;border:1px solid rgba(46,38,34,.16);border-radius:999px;background:#fff;font-family:'Source Sans 3',sans-serif;font-size:13px;color:#2E2622}
.ff-search:focus{outline:none;border-color:#0598A6;box-shadow:0 0 0 3px rgba(5,152,166,.15)}
.ff-sel{padding:8px 11px;border:1px solid rgba(46,38,34,.16);border-radius:999px;background:#fff;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;color:rgba(46,38,34,.7);cursor:pointer}
.ff-sel:focus{outline:none;border-color:#0598A6;box-shadow:0 0 0 3px rgba(5,152,166,.15)}
.ff-count{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.05em;color:rgba(46,38,34,.4);white-space:nowrap}

/* ---------- clickable rows ---------- */
.ff-tr{cursor:pointer;transition:background .14s ease}
.ff-tr:hover{background:rgba(5,152,166,.06)}
.ff-tr:focus-visible{outline:2px solid #0598A6;outline-offset:-2px}

/* ---------- detail drawer ---------- */
.ff-scrim{position:fixed;inset:0;background:rgba(46,38,34,.42);z-index:50;animation:ff-fade .2s ease}
.ff-drawer{position:fixed;top:0;right:0;bottom:0;width:min(520px,100vw);z-index:51;background:#FAF7F1;border-left:3px solid #F38637;
  box-shadow:-20px 0 50px -30px rgba(46,38,34,.7);overflow-y:auto;animation:ff-slide .28s cubic-bezier(.2,.7,.3,1);
  font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;color:#2E2622;box-sizing:border-box}
.ff-drawer *{box-sizing:border-box}
.ff-drawer-inner{padding:30px 32px 48px}
.ff-drawer-x{position:absolute;top:16px;right:18px;width:32px;height:32px;border:none;border-radius:50%;background:rgba(46,38,34,.07);color:#2E2622;font-size:20px;line-height:1;cursor:pointer}
.ff-drawer-x:hover{background:rgba(46,38,34,.14)}
.ff-drawer .ff-crumb{display:flex;align-items:center;gap:10px;padding-right:46px;font-weight:600}
.ff-pos{margin-left:auto;font-style:normal;color:rgba(46,38,34,.35)}
.ff-drawer-title{margin:0;font-size:27px;font-weight:700;letter-spacing:-.025em;line-height:1.1}
.ff-drawer-sub{margin:9px 0 0;font-size:12.5px;color:rgba(46,38,34,.5)}
.ff-nav{display:flex;gap:8px;margin:18px 0 4px;padding-bottom:20px;border-bottom:1px solid rgba(46,38,34,.12)}
.ff-alert.is-info{background:rgba(5,152,166,.08);border:1px solid rgba(5,152,166,.32)}
.ff-facts{display:flex;flex-direction:column;gap:7px}
.ff-facts div{display:flex;align-items:baseline;gap:12px;padding:11px 14px;border:1px solid rgba(46,38,34,.12);border-radius:10px;background:#fff}
.ff-facts span{flex:0 0 84px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.42)}
.ff-facts b{font-size:14px;font-weight:600;word-break:break-word}
.ff-facts a{color:#0598A6}
.ff-attrib{padding:15px;border:1px solid rgba(46,38,34,.12);border-radius:11px;background:#fff}
.ff-chan.is-big{font-size:10.5px;padding:5px 13px}
.ff-why{margin:11px 0 0;font-size:13px;line-height:1.5;color:rgba(46,38,34,.6)}
.ff-src{margin:9px 0 0;font-family:'IBM Plex Mono',monospace;font-size:10.5px;line-height:1.5;word-break:break-all;color:rgba(46,38,34,.4)}
.ff-message{margin:0;padding:15px 16px;border:1px solid rgba(46,38,34,.12);border-left:3px solid #0598A6;border-radius:4px 11px 11px 4px;background:#fff;font-size:13.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
@keyframes ff-slide{from{transform:translateX(100%)}to{transform:none}}
@keyframes ff-fade{from{opacity:0}to{opacity:1}}
@media (max-width:900px){
  .ff-drawer{width:100vw;border-left:none;border-top:3px solid #F38637}
  .ff-drawer-inner{padding:26px 20px 44px}
  .ff-count{margin-left:0;width:100%}
}
@media print{.ff-drawer,.ff-scrim{display:none !important}}

.ff-modal-wrap{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(46,38,34,.5);font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;color:#2E2622}
.ff-modal{position:relative;width:min(600px,100%);max-height:92vh;overflow-y:auto;padding:32px 34px 28px;border-radius:18px;background:#FAF7F1;border-top:4px solid #F38637;box-sizing:border-box}
.ff-modal *{box-sizing:border-box}
.ff-modal.is-narrow{width:min(450px,100%)}
.ff-modal-x{position:absolute;top:16px;right:18px;width:32px;height:32px;border:none;border-radius:50%;background:rgba(46,38,34,.07);color:#2E2622;font-size:20px;line-height:1;cursor:pointer}
.ff-modal-x:hover{background:rgba(46,38,34,.14)}
.ff-crumb{margin:0 0 6px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.ff-modal-title{margin:0;font-size:26px;font-weight:700;letter-spacing:-.025em}
.ff-modal-sub{margin:9px 0 22px;font-size:14px;line-height:1.5;color:rgba(46,38,34,.55)}
.ff-drop{padding:34px 20px;border:2px dashed rgba(46,38,34,.2);border-radius:14px;background:#fff;text-align:center;cursor:pointer;transition:border-color .16s ease,background .16s ease}
.ff-drop:hover,.ff-drop.is-over{border-color:#F38637;background:rgba(243,134,55,.05)}
.ff-drop-main{margin:0;font-size:15px;font-weight:600}
.ff-drop-sub{margin:6px 0 0;font-size:12.5px;color:rgba(46,38,34,.45)}
.ff-alert{display:flex;flex-direction:column;gap:5px;margin-top:14px;padding:14px 16px;border-radius:11px;font-size:13.5px;line-height:1.45}
.ff-alert.is-good{background:rgba(144,173,81,.14);border:1px solid rgba(144,173,81,.4)}
.ff-alert.is-bad{background:rgba(243,134,55,.13);border:1px solid rgba(243,134,55,.45)}
.ff-alert span{color:rgba(46,38,34,.66);font-size:12.5px}
.ff-alert-warn{color:#B4622A !important;font-weight:600}
.ff-modal-fine{margin:14px 0 0;font-size:12px;line-height:1.5;color:rgba(46,38,34,.45)}
.ff-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px;padding-top:20px;border-top:1px solid var(--line,rgba(46,38,34,.12))}
.ff-field{display:block;margin-top:14px}
.ff-field span{display:block;margin-bottom:5px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.ff-field span i{font-style:normal;text-transform:none;letter-spacing:0;color:rgba(46,38,34,.3)}
.ff-field input{width:100%;padding:10px 13px;border:1px solid rgba(46,38,34,.18);border-radius:9px;background:#fff;font-family:'Source Sans 3',sans-serif;font-size:14.5px;color:#2E2622}
.ff-field input:focus{outline:none;border-color:#0598A6;box-shadow:0 0 0 3px rgba(5,152,166,.15)}
.ff-check{display:flex;gap:11px;margin-top:18px;padding:14px 15px;border:1px solid rgba(5,152,166,.35);border-radius:11px;background:rgba(5,152,166,.06);cursor:pointer}
.ff-check input{margin-top:3px;width:16px;height:16px;flex-shrink:0;accent-color:#0598A6;cursor:pointer}
.ff-check b{display:block;font-size:13.5px;font-weight:600}
.ff-check i{display:block;margin-top:5px;font-style:normal;font-size:12px;line-height:1.5;color:rgba(46,38,34,.6)}

@media (max-width:900px){
  .ff-root{padding:26px 18px 48px}
  .ff-head-right{align-items:flex-start;width:100%}
  .ff-kpis{grid-template-columns:1fr 1fr}
  .ff-two{grid-template-columns:1fr;gap:0}
  .ff-range-note{margin-left:0;width:100%}
  .ff-modal{padding:26px 20px 22px}
  .ff-day-label i{display:none}
}
@media (max-width:520px){
  .ff-kpis{grid-template-columns:1fr}
  .ff-barrow{grid-template-columns:86px 1fr 52px}
  .ff-modal-actions{flex-direction:column-reverse}
  .ff-modal-actions .ff-btn{width:100%}
}
@media (prefers-reduced-motion:reduce){.ff-root *{transition:none !important;animation:none !important}}

/* ---------- print ---------- */
.ff-print{display:none}
@media print{
  @page{size:letter portrait;margin:0.5in}
  html,body{background:#fff !important}
  .ff-root,.ff-modal-wrap{display:none !important}
  .ff-print{display:block !important;font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;color:#2E2622;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ff-print *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
  .ff-print-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:16px;margin-bottom:24px;border-bottom:3px solid #F38637}
  .ff-print-brand{margin:0 0 6px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#0598A6}
  .ff-print-head h1{margin:0;font-size:29px;font-weight:700;letter-spacing:-.025em;line-height:1.05}
  .ff-print-crumb{margin:6px 0 0;font-size:12.5px;color:rgba(46,38,34,.55)}
  .ff-print-meta{display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(46,38,34,.5);white-space:nowrap}
  .ff-print .ff-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .ff-print .ff-kpi{border:1px solid rgba(46,38,34,.18);padding:12px 13px}
  .ff-print .ff-kpi-value{font-size:23px}
  .ff-print .ff-h3{margin:24px 0 10px;font-size:10px;letter-spacing:.14em}
  .ff-print .ff-panel,.ff-print .ff-barrow,.ff-print .ff-kpi{break-inside:avoid;border:1px solid rgba(46,38,34,.18)}
  .ff-print .ff-day-bars{height:130px}
  .ff-print .ff-week-bars{height:110px}
  .ff-print .ff-two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  .ff-print-foot{margin-top:30px;padding-top:12px;border-top:1px solid rgba(46,38,34,.15);font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;line-height:1.7;color:rgba(46,38,34,.4)}
}
`;
