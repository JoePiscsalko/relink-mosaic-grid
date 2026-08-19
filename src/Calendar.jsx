import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Image as ImageIcon, CalendarDays, Users, RefreshCw } from "lucide-react";

/* ==================================================================
   MARKETING CALENDAR

   Joe's calendar, moved off the artifact `window.storage` API onto
   the same Netlify Blobs store the rest of the app uses. Everything
   about how it looks and behaves is his; what changed is underneath.

   Two differences worth knowing about:

   Images are fetched per entry rather than all at once, because a
   month of social posts is a lot of base64 to drag down on every
   page load for cards nobody opened.

   Writes need the passphrase. The grid and Form Fills ask on publish,
   which is occasional; a calendar gets edited all day, so it asks
   once and holds it for the session. Without that, anyone who found
   the URL could quietly delete a month of planning.
================================================================== */

const API = "/api/calendar";

const C = {
  cream: "#FAF7F1", paper: "#FFFFFF", brown: "#2E2622", brownSoft: "#6B5F57",
  line: "#E7E0D6", orange: "#F38637", orangeD: "#D46A1E", teal: "#0598A6",
  tealD: "#036E78", green: "#90AD51", greenD: "#6E8A36",
};

const SOCIAL_COLOR = C.teal;

const EMAIL_SUBS = [
  { id: "inventory", label: "Inventory", color: C.orange },
  { id: "imaging", label: "Imaging inventory", color: C.orangeD },
  { id: "provider", label: "Provider", color: C.green },
  { id: "buyer_journey", label: "Buyer journey", color: C.tealD },
  { id: "provider_journey", label: "Provider journey", color: C.greenD },
  { id: "auction", label: "Auction", color: C.brown },
  { id: "spotlight", label: "Product spotlight", color: "#7C5295" },
];
const EMAIL_MAP = Object.fromEntries(EMAIL_SUBS.map((s) => [s.id, s]));

const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn", color: "#0077B5" },
  { id: "instagram", label: "Instagram", color: "#C13584" },
  { id: "facebook", label: "Facebook", color: "#1877F2" },
];
const PLAT_MAP = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

/* Older entries used a flat type. Map them forward on read. */
const MIGRATE = {
  social: { type: "social", sub: null },
  email_buyer: { type: "email", sub: "buyer_journey" },
  email_provider: { type: "email", sub: "provider" },
  email_inventory: { type: "email", sub: "inventory" },
  email_imaging: { type: "email", sub: "imaging" },
  email_journey: { type: "email", sub: "buyer_journey" },
  auction: { type: "email", sub: "auction" },
  linkedin: { type: "social_ad", sub: "linkedin" },
};

const leafKey = (e) => (e.type === "social" ? "social" : e.type === "email" ? "email:" + e.sub : "ad:" + e.sub);
const entryColor = (e) =>
  e.type === "social" ? SOCIAL_COLOR : e.type === "email" ? EMAIL_MAP[e.sub]?.color || C.brownSoft : PLAT_MAP[e.sub]?.color || C.brownSoft;

const ALL_LEAVES = ["social", ...EMAIL_SUBS.map((s) => "email:" + s.id), ...PLATFORMS.map((p) => "ad:" + p.id)];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = fmt(new Date());

/* ---------------- the passphrase ---------------- */
/* Held for the session so nobody types it forty times a day. */
let writeKey = "";
try { writeKey = sessionStorage.getItem("mc:key") || ""; } catch (e) { /* private mode */ }

function askKey(reason) {
  const k = window.prompt(reason || "Write passphrase for the calendar (same one the grid uses):", "");
  if (!k) return null;
  writeKey = k;
  try { sessionStorage.setItem("mc:key", k); } catch (e) { /* fine, ask again next reload */ }
  return k;
}
function forgetKey() {
  writeKey = "";
  try { sessionStorage.removeItem("mc:key"); } catch (e) { /* nothing to do */ }
}

/* ---------------- storage ---------------- */
async function post(payload, retry = true) {
  const key = writeKey || askKey();
  if (!key) throw new Error("cancelled");
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, key }),
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && retry) {
    forgetKey();
    if (!askKey("That passphrase didn't match. Try again:")) throw new Error("cancelled");
    return post(payload, false);
  }
  if (!res.ok) throw new Error(out.error || "Save failed.");
  return out;
}
async function fetchEntries() {
  const res = await fetch(API, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("load failed");
  return res.json();
}
async function fetchImage(id) {
  const res = await fetch(`${API}?img=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const out = await res.json().catch(() => ({}));
  return out.value || null;
}

function resizeImage(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else if (h >= w && h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Calendar() {
  const [cur, setCur] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [entries, setEntries] = useState([]);
  const [images, setImages] = useState({});
  const [active, setActive] = useState(() => new Set(ALL_LEAVES));
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [online, setOnline] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const fileRef = useRef(null);
  const imagesRef = useRef({});

  const applyImages = (updater) =>
    setImages((prev) => {
      const n = typeof updater === "function" ? updater(prev) : updater;
      imagesRef.current = n;
      return n;
    });

  const sync = async (manual = false) => {
    if (manual) setSyncing(true);
    try {
      const out = await fetchEntries();
      setOnline(true);
      let list = out.entries || [];
      let changed = false;
      list = list.map((e) => {
        if (["social", "email", "social_ad"].includes(e.type)) return e;
        changed = true;
        const m = MIGRATE[e.type] || { type: "email", sub: "inventory" };
        return { ...e, type: m.type, sub: m.sub };
      });
      setEntries(list);
      if (changed && writeKey) { try { await post({ entries: list }); } catch (e) { /* migrate on next write */ } }

      const have = imagesRef.current;
      const missing = list.filter((e) => e.hasImage && !have[e.id]);
      if (missing.length) {
        const add = {};
        await Promise.all(missing.map(async (e) => {
          const v = await fetchImage(e.id);
          if (v) add[e.id] = v;
        }));
        applyImages((prev) => ({ ...prev, ...add }));
      }
      setLastSync(new Date());
    } catch (err) {
      setOnline(false);
    }
    if (manual) setSyncing(false);
  };

  useEffect(() => {
    (async () => { await sync(); setLoading(false); })();
    const id = setInterval(() => sync(), 20000);
    return () => clearInterval(id);
  }, []);

  const year = cur.getFullYear(), month = cur.getMonth();
  const start = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const entriesFor = (ds) => entries.filter((e) => e.date === ds && active.has(leafKey(e)));

  const openNew = (ds) => setDraft({ id: null, date: ds, type: "social", sub: null, title: "", notes: "", image: null });
  const openEdit = (e) => setDraft({ id: e.id, date: e.date, type: e.type, sub: e.sub ?? null, title: e.title, notes: e.notes || "", image: images[e.id] || null });

  const toggle = (key) => setActive((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const allOn = () => setActive(new Set(ALL_LEAVES));
  const allOff = () => setActive(new Set());

  const changeType = (t) =>
    setDraft((d) => ({ ...d, type: t, sub: t === "email" ? "inventory" : t === "social_ad" ? "linkedin" : null, image: t === "social" ? d.image : null }));

  const onFile = async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try { const data = await resizeImage(f); setDraft((d) => ({ ...d, image: data })); }
    catch { setError("Couldn't process that image. Try a different file."); }
    ev.target.value = "";
  };

  const save = async () => {
    if (!draft.title.trim()) { setError("Add a title first."); return; }
    setError(null);
    const isSocial = draft.type === "social";
    const img = isSocial ? draft.image : null;
    const id = draft.id || "e" + Date.now() + Math.floor(Math.random() * 1000);
    const rec = { id, date: draft.date, type: draft.type, sub: isSocial ? null : draft.sub, title: draft.title.trim(), notes: draft.notes.trim(), hasImage: !!img };
    const next = draft.id ? entries.map((e) => (e.id === id ? rec : e)) : [...entries, rec];

    /* The server is the truth here — write first, then move the UI, so
       a failed save never leaves the calendar showing something that
       isn't there for anyone else. */
    try {
      if (img !== (images[id] || null)) await post({ img: id, value: img });
      await post({ entries: next });
    } catch (err) {
      if (err.message !== "cancelled") setError(err.message || "That didn't save.");
      return;
    }

    setEntries(next);
    applyImages((prev) => { const n = { ...prev }; if (img) n[id] = img; else delete n[id]; return n; });
    setDraft(null);
  };

  const del = async () => {
    if (!draft.id) { setDraft(null); return; }
    const next = entries.filter((e) => e.id !== draft.id);
    try {
      await post({ entries: next });
      await post({ img: draft.id, value: null });
    } catch (err) {
      if (err.message !== "cancelled") setError(err.message || "That didn't delete.");
      return;
    }
    setEntries(next);
    applyImages((prev) => { const n = { ...prev }; delete n[draft.id]; return n; });
    setDraft(null);
  };

  const goMonth = (delta) => setCur(new Date(year, month + delta, 1));
  const goToday = () => { const d = new Date(); setCur(new Date(d.getFullYear(), d.getMonth(), 1)); };

  const monthCount = entries.filter((e) => {
    const [y, m] = e.date.split("-").map(Number);
    return y === year && m - 1 === month && active.has(leafKey(e));
  }).length;

  const syncLabel = lastSync ? `Updated ${lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";

  const Chip = ({ k, label, color }) => {
    const on = active.has(k);
    return (
      <button onClick={() => toggle(k)} title={label}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
          padding: "4px 10px", borderRadius: 20, border: `1px solid ${on ? color : C.line}`, fontFamily: "inherit",
          background: on ? color : C.paper, color: on ? "#fff" : C.brownSoft, opacity: on ? 1 : 0.7 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "#fff" : color, display: "inline-block" }} />
        {label}
      </button>
    );
  };

  return (
    <div style={{ background: C.cream, minHeight: "100vh", fontFamily: "'Source Sans 3', ui-sans-serif, system-ui, sans-serif", color: C.brown, padding: "20px", boxSizing: "border-box" }}>
      <style>{`@keyframes mcspin{to{transform:rotate(360deg)}} .mc-wrap *{box-sizing:border-box}`}</style>
      <div className="mc-wrap" style={{ maxWidth: 1080, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <CalendarDays size={26} color={C.orange} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.brown }}>Marketing Calendar</h1>
            <div style={{ fontSize: 13, color: C.brownSoft }}>reLink Medical · {monthCount} item{monthCount === 1 ? "" : "s"} this month</div>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#EAF3DE", color: C.greenD, fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20 }}>
            <Users size={13} /> Shared team calendar
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: 4 }}>
            <button onClick={() => goMonth(-1)} style={navBtn}><ChevronLeft size={18} /></button>
            <div style={{ minWidth: 150, textAlign: "center", fontWeight: 600, fontSize: 15 }}>{MONTHS[month]} {year}</div>
            <button onClick={() => goMonth(1)} style={navBtn}><ChevronRight size={18} /></button>
          </div>
          <button onClick={() => sync(true)} style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6 }} title={syncLabel || "Pull the latest entries"}>
            <RefreshCw size={15} style={{ animation: syncing ? "mcspin 0.8s linear infinite" : "none" }} /> Refresh
          </button>
          <button onClick={goToday} style={ghostBtn}>Today</button>
          <button onClick={() => openNew(todayStr)} style={primaryBtn}><Plus size={16} /> Add entry</button>
        </div>

        {online === false && (
          <div style={banner}>Storage isn&rsquo;t reachable, so nothing can be saved from here right now.</div>
        )}

        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
            <span style={grpLabel}>Social</span>
            <Chip k="social" label="Social post" color={SOCIAL_COLOR} />
            <span style={{ flex: 1 }} />
            <button onClick={allOn} style={tinyBtn}>All</button>
            <button onClick={allOff} style={tinyBtn}>None</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
            <span style={grpLabel}>Email</span>
            {EMAIL_SUBS.map((s) => <Chip key={s.id} k={"email:" + s.id} label={s.label} color={s.color} />)}
          </div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
            <span style={grpLabel}>Social ad</span>
            {PLATFORMS.map((p) => <Chip key={p.id} k={"ad:" + p.id} label={p.label} color={p.color} />)}
          </div>
        </div>

        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: C.brown }}>
            {DOW.map((d) => <div key={d} style={{ padding: "9px 0", textAlign: "center", color: C.cream, fontSize: 12, fontWeight: 600, letterSpacing: 0.4 }}>{d}</div>)}
          </div>
          {weeks.map((wk, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {wk.map((d, di) => {
                const ds = d ? fmt(d) : null;
                const items = d ? entriesFor(ds) : [];
                const isToday = ds === todayStr;
                return (
                  <div key={di} onClick={() => d && openNew(ds)}
                    style={{ minHeight: 108, borderRight: di < 6 ? `1px solid ${C.line}` : "none", borderTop: wi > 0 ? `1px solid ${C.line}` : "none",
                      padding: 6, cursor: d ? "pointer" : "default", background: d ? (isToday ? "#FFF6EC" : C.paper) : "#FBF8F2", position: "relative" }}>
                    {d && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: isToday ? 700 : 500,
                          color: isToday ? "#fff" : C.brownSoft, background: isToday ? C.orange : "transparent",
                          width: 21, height: 21, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{d.getDate()}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {items.slice(0, 4).map((e) => (
                        <div key={e.id} onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                          style={{ background: entryColor(e), color: "#fff", borderRadius: 5, padding: "2px 6px", fontSize: 11, fontWeight: 500,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                          {e.hasImage && <ImageIcon size={10} style={{ flexShrink: 0 }} />}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
                        </div>
                      ))}
                      {items.length > 4 && <div style={{ fontSize: 10.5, color: C.brownSoft, paddingLeft: 4 }}>+{items.length - 4} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {loading && <div style={{ textAlign: "center", color: C.brownSoft, fontSize: 13, marginTop: 12 }}>Loading saved entries&hellip;</div>}
        <div style={{ fontSize: 12, color: C.brownSoft, marginTop: 12, textAlign: "center" }}>
          Shared calendar — auto-refreshes every 20s · {syncLabel || "syncing…"} · click any day to add an entry
        </div>
      </div>

      {draft && (
        <div onClick={() => setDraft(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(46,38,34,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
          <div onClick={(ev) => ev.stopPropagation()}
            style={{ background: C.paper, borderRadius: 14, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.line}` }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{draft.id ? "Edit entry" : "New entry"}</h2>
              <button onClick={() => setDraft(null)} style={navBtn}><X size={18} /></button>
            </div>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              {error && <div style={{ ...banner, marginBottom: 0 }}>{error}</div>}

              <Field label="Title">
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Refurbished C-arm spotlight" style={input} autoFocus />
              </Field>

              <div style={{ display: "flex", gap: 12 }}>
                <Field label="Category" style={{ flex: 1 }}>
                  <select value={draft.type} onChange={(e) => changeType(e.target.value)} style={input}>
                    <option value="social">Social post</option>
                    <option value="email">Email</option>
                    <option value="social_ad">Social ad</option>
                  </select>
                </Field>
                <Field label="Date" style={{ flex: 1 }}>
                  <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} style={input} />
                </Field>
              </div>

              {draft.type === "email" && (
                <Field label="Email type">
                  <select value={draft.sub} onChange={(e) => setDraft({ ...draft, sub: e.target.value })} style={input}>
                    {EMAIL_SUBS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
              )}
              {draft.type === "social_ad" && (
                <Field label="Platform">
                  <select value={draft.sub} onChange={(e) => setDraft({ ...draft, sub: e.target.value })} style={input}>
                    {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
              )}

              <Field label="Notes (subject line, copy, link…)">
                <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  rows={3} style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
              </Field>

              {draft.type === "social" && (
                <Field label="Image">
                  {draft.image ? (
                    <div style={{ position: "relative" }}>
                      <img src={draft.image} alt="" style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.line}`, display: "block" }} />
                      <button onClick={() => setDraft({ ...draft, image: null })}
                        style={{ position: "absolute", top: 8, right: 8, background: "rgba(46,38,34,0.8)", color: "#fff", border: "none",
                          borderRadius: 8, padding: "5px 9px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
                        <X size={13} /> Remove
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => fileRef.current?.click()}
                      style={{ border: `2px dashed ${C.line}`, borderRadius: 10, padding: "22px 10px", width: "100%", background: C.cream, fontFamily: "inherit",
                        cursor: "pointer", color: C.brownSoft, fontSize: 13, fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <ImageIcon size={22} color={C.teal} />
                      Click to upload an image
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
                </Field>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderTop: `1px solid ${C.line}` }}>
              {draft.id ? (
                <button onClick={del} style={{ ...ghostBtn, color: "#B23A28", borderColor: "#E5C3BC", display: "flex", alignItems: "center", gap: 5 }}>
                  <Trash2 size={15} /> Delete
                </button>
              ) : <span />}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDraft(null)} style={ghostBtn}>Cancel</button>
                <button onClick={save} style={primaryBtn}>{draft.id ? "Save changes" : "Add to calendar"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: "block", ...style }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#6B5F57", marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}

const input = { width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 14, borderRadius: 9, border: "1px solid #E7E0D6", background: "#fff", color: "#2E2622", fontFamily: "inherit", outline: "none" };
const navBtn = { background: "transparent", border: "none", cursor: "pointer", color: "#2E2622", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 8, fontFamily: "inherit" };
const ghostBtn = { background: "#fff", border: "1px solid #E7E0D6", borderRadius: 10, padding: "8px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", color: "#2E2622", fontFamily: "inherit" };
const primaryBtn = { background: "#F38637", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", color: "#fff", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" };
const tinyBtn = { background: "transparent", border: "none", fontSize: 12.5, fontWeight: 600, color: "#6B5F57", cursor: "pointer", padding: "5px 6px", fontFamily: "inherit" };
const grpLabel = { fontSize: 11, fontWeight: 700, color: "#9A8E83", textTransform: "uppercase", letterSpacing: 0.5, minWidth: 64 };
const banner = { background: "rgba(243,134,55,.13)", border: "1px solid rgba(243,134,55,.45)", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "#8A4A16", marginBottom: 14 };
