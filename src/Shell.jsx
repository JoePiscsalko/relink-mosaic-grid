import React, { useState, useEffect } from "react";
import App from "./App.jsx";
import FormFills from "./FormFills.jsx";
import Calendar from "./Calendar.jsx";

/* ==================================================================
   SHELL — the tab strip, and nothing else.

   The grid and the form fills view are independent: separate state,
   separate storage keys, separate publish. This file only decides
   which one is on screen, and keeps that in the URL hash so a link
   can point straight at either.

     marketing-grid.netlify.app           the grid
     marketing-grid.netlify.app/#forms    the form fills report
     marketing-grid.netlify.app/#calendar the marketing calendar
================================================================== */

const TABS = [
  { key: "grid", label: "Mosaic Grid", hash: "" },
  { key: "forms", label: "Form Fills", hash: "#forms" },
  { key: "calendar", label: "Calendar", hash: "#calendar" },
];

const tabFromHash = () => {
  if (typeof window === "undefined") return "grid";
  const hit = TABS.find((t) => t.hash && t.hash === window.location.hash);
  return hit ? hit.key : "grid";
};

export default function Shell() {
  const [tab, setTab] = useState(tabFromHash);

  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const go = (t) => {
    setTab(t.key);
    if (typeof window !== "undefined") {
      if (t.hash) window.location.hash = t.hash;
      else if (window.history?.replaceState) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      else window.location.hash = "";
    }
  };

  return (
    <>
      <style>{SHELL_CSS}</style>
      <nav className="sh-tabs" aria-label="Sections">
        <span className="sh-mark">reLink<i>Marketing</i></span>
        <div className="sh-pills" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={"sh-pill" + (tab === t.key ? " is-on" : "")}
              onClick={() => go(t)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      {tab === "forms" ? <FormFills /> : tab === "calendar" ? <Calendar /> : <App />}
    </>
  );
}

const SHELL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

.sh-tabs{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:20px;flex-wrap:wrap;
  padding:12px 28px;background:rgba(250,247,241,.94);backdrop-filter:blur(8px);
  border-bottom:1px solid rgba(46,38,34,.12);
  font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;box-sizing:border-box}
.sh-tabs *{box-sizing:border-box}
.sh-mark{display:flex;align-items:baseline;gap:7px;font-size:16px;font-weight:700;letter-spacing:-.02em;color:#2E2622}
.sh-mark i{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:400;letter-spacing:.16em;text-transform:uppercase;color:#0598A6}
.sh-pills{display:flex;gap:4px;padding:3px;border:1px solid rgba(46,38,34,.12);border-radius:999px;background:#fff}
.sh-pill{padding:7px 18px;border:none;border-radius:999px;background:transparent;font-family:inherit;font-size:13.5px;font-weight:600;color:rgba(46,38,34,.55);cursor:pointer;transition:background .16s ease,color .16s ease}
.sh-pill:hover{color:#2E2622}
.sh-pill.is-on{background:#2E2622;color:#FAF7F1}
.sh-pill:focus-visible{outline:2px solid #0598A6;outline-offset:2px}

@media (max-width:900px){
  .sh-tabs{padding:10px 18px;gap:12px}
  .sh-mark{font-size:15px}
}
@media print{.sh-tabs{display:none !important}}
`;
