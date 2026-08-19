import React, { useState, useMemo, useEffect, useRef } from "react";
import BenchmarkPanel from "./Benchmarks.jsx";

/* ==================================================================
   MOSAIC GRID — SBU x channel performance, filterable by date

   Data is stored as dated rows, not as totals. Every number you see
   is added up from rows inside the selected date range, so changing
   the range changes everything: cells, roll-ups, trends and PDFs.

   A row with week = null is undated — it came from an export that
   wasn't segmented by time. Undated rows only appear under "All
   time", because there's no honest way to slice them.

   To get dated rows: segment the export by week (Google) or export
   daily (LinkedIn). The importer buckets days into weeks itself.
================================================================== */

const SBUS = [
  { key: "ready",  name: "reLink Ready\u00AE", owner: "Owner TBD", blurb: "New, refurbished, rentals, depot, PM" },
  { key: "disp",   name: "Disposition",        owner: "Owner TBD", blurb: "Core removal and resale service" },
  { key: "r360",   name: "reLink360\u00AE",    owner: "Owner TBD", blurb: "Full-service managed program" },
  { key: "trans",  name: "Transactional",      owner: "Owner TBD", blurb: "One-off buys and sells" },
  { key: "netnew", name: "Net New",            owner: "Owner TBD", blurb: "Net new reLink360 partners" },
  { key: "mev",    name: "MEV",                owner: "Owner TBD", blurb: "Medical equipment vendors, auctions" },
  { key: "brand",  name: "Brand",              owner: "Shared",    blurb: "Branded search, credited to no single unit" },
];

const CHANNELS = [
  { key: "google",  name: "Google Ads",     reach: "Impressions", paid: true,  kind: "paid",  unit: "campaign", note: "Search, PMax, Shopping" },
  { key: "social",  name: "Paid Social",    reach: "Impressions", paid: true,  kind: "paid",  unit: "campaign", note: "LinkedIn and Meta" },
  { key: "email",   name: "Email",          reach: "Sends",       paid: false, kind: "email", unit: "email",    note: "SFMC journeys and sends" },
  { key: "display", name: "Display Ads",    reach: "Impressions", paid: true,  kind: "paid",  unit: "campaign", note: "Retargeting and prospecting" },
  { key: "toolkit", name: "Sales Tool Kit", reach: "Touches",     paid: false, kind: "owned", unit: "asset",    note: "What the AE team carries" },
];

const CAMPAIGN_RULES = [
  { match: "blended",         sbu: "brand" },
  { match: "branded",         sbu: "brand" },
  { match: "ready products",  sbu: "ready" },
  { match: "ready -",         sbu: "ready" },
  { match: "rental",          sbu: "ready" },
  { match: "disposition",     sbu: "disp" },
  { match: "commercial",      sbu: "disp" },
  { match: "auction",         sbu: "mev" },
  { match: "vendor",          sbu: "mev" },
  { match: "most wanted",     sbu: "mev" },
  { match: "net new",         sbu: "netnew" },
  { match: "hospital acquis", sbu: "netnew" },
  { match: "relink online",   sbu: "trans" },
  { match: "ebay",            sbu: "trans" },
  { match: "360",             sbu: "r360" },
];

const TYPE_RULES = [
  { match: "performance max", channel: "google" },
  { match: "shopping",        channel: "google" },
  { match: "search",          channel: "google" },
  { match: "demand gen",      channel: "display" },
  { match: "display",         channel: "display" },
  { match: "video",           channel: "display" },
  { match: "discovery",       channel: "display" },
];

const NO_DATA = {
  "ready|display": "No Display campaigns running for Ready.",
  "r360|google":   "No Google campaigns running for 360.",
  "netnew|google": "No Google campaigns running for Net New.",
  "trans|google":  "No Google campaigns running for Transactional.",
  "ready|social":  "No LinkedIn campaigns running for Ready.",
  "r360|social":   "No LinkedIn campaigns running for 360.",
  "netnew|social": "No LinkedIn campaigns running for Net New.",
};

/* row: business unit, channel, week (null = undated), name, spend, leads, reach, clicks */
const r = (s, ch, week, name, spend, leads, reach, clicks, opens = 0, unsubs = 0, revenue = 0) =>
  ({ s, ch, week, name, spend, leads, reach, clicks, opens, unsubs, revenue });
const q = (s, ch, week, text, match, spend, leads, reach, clicks) => ({ s, ch, week, text, match, spend, leads, reach, clicks });

/* Google Ads campaign export, Apr 28 - Jul 27 2026. Not segmented by
   week, so these are undated. Re-export with Segment > Time > Week
   and they become filterable. */
const SEED_ROWS = [
  r("ready","google",null,"Ready Products - PMAX",15072,137,3947001,39856,0,0,65707),
  r("disp","google",null,"Disposition - PMAX Shopping Feed ONLY",17091,319,2194856,31207,0,0,90034),
  r("disp","google",null,"Commercial - Disposition Partners",887,7,2707,322,0,0,180),
  r("brand","google",null,"Blended - Branded",1465,381,3345,1413,0,0,32719),
  r("mev","google",null,"Monthly Auction Campaign",1185,34,6302,767,0,0,11959),
  r("ready","google",null,"Ready Products - Repair",4069,55,8218,759,0,0,410),
  r("disp","google",null,"Disposition - Used Medical Equipment - Product Type",2831,10,15868,923,0,0,3400),
  r("disp","google",null,"Disposition - Used Medical Equipment",5443,120,16663,1458,0,0,1604),
  r("ready","google",null,"Ready Products - Rental",6478,161,24412,2161,0,0,2170),
  r("ready","google",null,"Ready Products - Top Brands",4217,13,14972,974,0,0,2917),
];

/* LinkedIn Campaign Manager, daily rows bucketed into weeks. */
const SEED_LI = [
  r("disp","social","2026-06-29","Commercial - Custom Audiences - 2026",473,0,224,0),
  r("disp","social","2026-06-29","Commercial - List Targeting - 2026",84,0,441,3),
  r("disp","social","2026-06-29","Commercial - RM Remarketing - 2026",197,0,4055,17),
  r("disp","social","2026-07-06","Commercial - Custom Audiences - 2026",210,0,172,0),
  r("disp","social","2026-07-06","Commercial - List Targeting - 2026",74,0,558,3),
  r("disp","social","2026-07-06","Commercial - RM Remarketing - 2026",105,2,2607,17),
  r("disp","social","2026-07-13","Commercial - Custom Audiences - 2026",350,0,207,1),
  r("disp","social","2026-07-13","Commercial - List Targeting - 2026",87,0,635,3),
  r("disp","social","2026-07-13","Commercial - RM Remarketing - 2026",168,0,3389,18),
  r("disp","social","2026-07-20","Commercial - Custom Audiences - 2026",524,0,356,1),
  r("disp","social","2026-07-20","Commercial - List Targeting - 2026",70,0,431,0),
  r("disp","social","2026-07-20","Commercial - RM Remarketing - 2026",188,0,4059,16),
  r("disp","social","2026-07-27","Commercial - Custom Audiences - 2026",273,0,150,1),
  r("disp","social","2026-07-27","Commercial - List Targeting - 2026",35,0,219,2),
  r("disp","social","2026-07-27","Commercial - RM Remarketing - 2026",80,0,1550,9),
];

/* Google Ads search keyword report, same window, also undated. */
const SEED_KW = [
  q("ready","google",null,"rent hospital equipment","Phrase",1595,36,6375,535),
  q("ready","google",null,"medical equipment rental","Phrase",1216,29,4775,424),
  q("ready","google",null,"medical equipment repair companies","Phrase",1188,13,2527,216),
  q("ready","google",null,"covidien","Phrase",1163,4,3081,282),
  q("ready","google",null,"medical equipment repair companies near me","Phrase",1099,20,1795,208),
  q("ready","google",null,"medical rentals","Phrase",1087,37,3643,358),
  q("ready","google",null,"medical equipment rental companies","Phrase",988,21,3468,307),
  q("ready","google",null,"medical equipment repair services","Phrase",828,7,1524,138),
  q("ready","google",null,"medical equipment rental near me","Phrase",734,15,2786,232),
  q("ready","google",null,"covidien products","Exact",501,1,1321,145),
  q("ready","google",null,"medical equipment repair near me","Phrase",358,3,614,71),
  q("ready","google",null,"medical equipment repair","Phrase",347,6,888,64),
  q("ready","google",null,"midmark exam table","Phrase",185,0,567,29),
  q("ready","google",null,"medical equipment near me rental","Phrase",179,3,601,66),
  q("ready","google",null,"draeger medical","Phrase",176,0,550,31),
  q("ready","google",null,"stryker stretchers","Phrase",175,2,825,42),
  q("ready","google",null,"carl zeiss","Phrase",160,0,576,26),
  q("ready","google",null,"olympus scopes","Phrase",154,1,485,17),
  q("ready","google",null,"zoll defibrillators","Phrase",151,0,355,23),
  q("ready","google",null,"karl storz","Phrase",150,0,835,34),
  q("ready","google",null,"surgical equipment repair","Phrase",141,4,543,35),
  q("ready","google",null,"medical rentals near me","Phrase",138,2,779,69),
  q("ready","google",null,"used medical equipment rental near me","Phrase",137,6,297,27),
  q("ready","google",null,"stryker bed","Phrase",132,0,684,59),
  q("ready","google",null,"stryker hospital bed","Phrase",121,1,745,60),
  q("ready","google",null,"carl zeiss microscopy","Phrase",119,0,471,28),
  q("ready","google",null,"medical equipment rentals in my area","Phrase",114,5,458,33),
  q("ready","google",null,"stryker gurney","Phrase",109,0,568,21),
  q("ready","google",null,"ritter by midmark","Phrase",108,0,420,22),
  q("ready","google",null,"medical equipment rental prices","Phrase",97,5,310,27),
  q("ready","google",null,"stryker endoscopy","Phrase",78,0,398,7),
  q("ready","google",null,"philips intellivue","Phrase",75,0,308,11),
  q("ready","google",null,"olympus endoscopy","Phrase",70,0,259,7),
  q("ready","google",null,"ge healthcare patient monitors","Phrase",68,1,355,8),
  q("ready","google",null,"emergency medical equipment rental","Phrase",67,1,148,20),
  q("ready","google",null,"karl storz endoscope","Phrase",66,0,122,7),
  q("ready","google",null,"patient monitor repair service","Phrase",58,2,134,15),
  q("ready","google",null,"philips heart monitor","Phrase",54,1,93,7),
  q("ready","google",null,"carl zeiss surgical microscopes","Phrase",53,1,140,8),
  q("ready","google",null,"infusion pump repair service","Phrase",47,0,167,11),
  q("ready","google",null,"midmark exam chairs","Phrase",45,0,264,12),
  q("ready","google",null,"philips cardiac monitor","Phrase",43,0,155,15),
  q("ready","google",null,"short-term medical equipment rental","Phrase",40,0,114,11),
  q("ready","google",null,"mindray anesthesia machine","Phrase",40,0,81,7),
  q("ready","google",null,"affordable medical equipment rental","Phrase",37,1,193,17),
  q("ready","google",null,"philips patient monitors","Phrase",34,0,238,11),
  q("ready","google",null,"medical device rental near me","Phrase",32,1,295,24),
  q("ready","google",null,"welch allyn medical equipment","Phrase",28,0,175,11),
  q("ready","google",null,"zoll aed","Phrase",25,1,227,9),
  q("ready","google",null,"philips ultrasound","Phrase",22,0,193,6),
  q("ready","google",null,"ritter exam tables","Phrase",18,0,55,5),
  q("ready","google",null,"zoll aed plus","Phrase",17,0,36,2),
  q("ready","google",null,"storz endoscope","Phrase",16,0,43,5),
  q("ready","google",null,"hill rom medical devices","Phrase",16,0,13,2),
  q("ready","google",null,"used stryker stretcher for sale","Phrase",13,0,29,3),
  q("ready","google",null,"welch allyn medical devices","Phrase",12,0,121,5),
  q("ready","google",null,"stryker hospital beds for sale","Phrase",11,0,45,4),
  q("ready","google",null,"medical equipment rental store near me","Phrase",10,0,58,7),
  q("ready","google",null,"biomedical equipment repair","Phrase",5,0,21,1),
  q("ready","google",null,"zoll aed 3","Phrase",5,0,14,1),
  q("ready","google",null,"diagnostic imaging equipment rental","Phrase",3,0,22,2),
  q("ready","google",null,"mindray anesthesia monitor","Phrase",3,0,3,1),
  q("ready","google",null,"ventilator rental service","Phrase",3,0,66,2),
  q("ready","google",null,"philips intellivue x3","Phrase",2,0,20,1),
  q("ready","google",null,"drager apollo anesthesia machine","Phrase",0,0,7,0),
  q("ready","google",null,"fluke multimeters","Phrase",0,0,16,0),
  q("ready","google",null,"mindray anesthesia","Phrase",0,0,11,0),
  q("ready","google",null,"medical device maintenance services","Phrase",0,0,3,0),
  q("ready","google",null,"medical device repair companies","Phrase",0,0,2,0),
  q("ready","google",null,"ECG monitor rental","Phrase",0,0,5,0),
  q("ready","google",null,"surgical equipment rental near me","Phrase",0,0,1,0),
  q("ready","google",null,"rental of medical equipment near me","Phrase",0,0,17,0),
  q("ready","google",null,"medical equipment servicing companies","Phrase",0,0,1,0),
  q("ready","google",null,"ge carescape b450","Phrase",0,0,2,0),
  q("ready","google",null,"ge carescape b650","Phrase",0,0,1,0),
  q("ready","google",null,"philips hospital monitor","Phrase",0,0,2,0),
  q("ready","google",null,"philips mx40","Phrase",0,0,12,0),
  q("ready","google",null,"philips vital signs monitor","Phrase",0,0,10,0),
  q("ready","google",null,"philips intellivue mx40","Phrase",0,0,8,0),
  q("ready","google",null,"philips intellivue mp30","Phrase",0,0,1,0),
  q("ready","google",null,"baxter infusion pump","Phrase",0,0,2,0),
  q("ready","google",null,"baxter IV systems","Phrase",0,0,7,0),
  q("ready","google",null,"medrad medical equipment","Phrase",0,0,9,0),
  q("ready","google",null,"draeger anesthesia","Phrase",0,0,7,0),
  q("ready","google",null,"fluke biomedical products","Phrase",0,0,3,0),
  q("ready","google",null,"ritter medical exam table","Phrase",0,0,4,0),
  q("disp","google",null,"Buy Medical Devices","Phrase",2669,44,7695,387),
  q("disp","google",null,"medical equipment disposition","Broad",863,7,2550,317),
  q("disp","google",null,"Used Medical Instruments","Phrase",663,24,1744,215),
  q("disp","google",null,"ophthalmic instruments","Phrase",515,4,3796,165),
  q("disp","google",null,"Reconditioned Medical Equipment","Phrase",432,11,1691,176),
  q("disp","google",null,"Preowned Medical Equipment","Phrase",342,7,1131,153),
  q("disp","google",null,"Refurbished Medical Instruments","Phrase",323,0,775,75),
  q("disp","google",null,"Refurbished Medical Equipment","Phrase",267,11,740,90),
  q("disp","google",null,"medical monitoring devices","Phrase",263,2,1525,51),
  q("disp","google",null,"Used Medical Devices","Phrase",228,1,717,93),
  q("disp","google",null,"exam tables","Phrase",188,1,941,64),
  q("disp","google",null,"used ophthalmic equipment","Phrase",167,0,357,57),
  q("disp","google",null,"ophthalmology equipment","Phrase",158,0,960,53),
  q("disp","google",null,"Medical Equipment Liquidation","Phrase",139,4,499,74),
  q("disp","google",null,"medical exam tables","Phrase",132,1,551,45),
  q("disp","google",null,"Refurbished Medical Devices","Phrase",118,5,339,29),
  q("disp","google",null,"ultrasound equipment","Phrase",111,0,449,19),
  q("disp","google",null,"medical beds for sale","Phrase",108,0,606,53),
  q("disp","google",null,"ultrasound for sale","Phrase",94,0,705,34),
  q("disp","google",null,"vital sign monitor","Phrase",93,1,327,15),
  q("disp","google",null,"used medical equipment near me","Phrase",82,5,418,59),
  q("disp","google",null,"electrosurgical generator","Phrase",81,0,840,26),
  q("disp","google",null,"Second Hand Medical Equipment","Phrase",73,0,208,27),
  q("disp","google",null,"blood pressure machine for home","Phrase",73,0,225,17),
  q("disp","google",null,"used hospital beds for sale","Phrase",65,0,385,48),
  q("disp","google",null,"used hospital beds","Phrase",57,0,241,35),
  q("disp","google",null,"used medical exam tables","Phrase",56,0,118,17),
  q("disp","google",null,"ophthalmic equipment for sale","Phrase",54,0,382,18),
  q("disp","google",null,"used endoscopy equipment","Phrase",50,0,70,16),
  q("disp","google",null,"electrosurgical devices","Phrase",48,0,252,12),
  q("disp","google",null,"medical table","Phrase",47,0,218,8),
  q("disp","google",null,"used exam tables","Phrase",41,0,199,22),
  q("disp","google",null,"Second Hand Medical Instruments","Phrase",40,0,205,22),
  q("disp","google",null,"hospital beds","Phrase",38,0,379,17),
  q("disp","google",null,"blood pressure monitors","Phrase",35,0,203,9),
  q("disp","google",null,"patient monitoring devices","Phrase",34,0,63,3),
  q("disp","google",null,"we buy medical equipment","Phrase",33,9,253,30),
  q("disp","google",null,"exam chairs","Phrase",33,0,252,12),
  q("disp","google",null,"Affordable Medical Equipment","Phrase",29,1,217,25),
  q("disp","google",null,"home bp monitor","Phrase",27,0,55,4),
  q("disp","google",null,"used ultrasound machine for sale","Phrase",27,1,76,9),
  q("disp","google",null,"used anesthesia machines","Phrase",26,0,51,10),
  q("disp","google",null,"centurion service","Phrase",23,0,105,5),
  q("disp","google",null,"anesthesia machine","Phrase",23,0,78,5),
  q("disp","google",null,"hospital beds for sale","Phrase",21,0,132,10),
  q("disp","google",null,"endoscopy equipment","Phrase",21,0,234,5),
  q("disp","google",null,"refurbished ultrasound machine","Phrase",19,0,28,5),
  q("disp","google",null,"anesthesia machine for sale","Phrase",18,0,176,4),
  q("disp","google",null,"used ultrasound machine","Phrase",17,0,67,8),
  q("disp","google",null,"patient monitor","Phrase",15,0,69,3),
  q("disp","google",null,"used hospital beds for sale near me","Phrase",14,0,87,14),
  q("disp","google",null,"ultrasound machine","Phrase",13,0,40,5),
  q("disp","google",null,"electrosurgical unit","Phrase",13,0,181,4),
  q("disp","google",null,"ophthalmic equipment","Phrase",8,0,73,3),
  q("disp","google",null,"medical bed","Phrase",8,0,100,3),
  q("disp","google",null,"rigid endoscope","Phrase",5,0,80,2),
  q("disp","google",null,"smoke evacuation","Phrase",5,0,42,1),
  q("disp","google",null,"hospital strecher","Phrase",4,0,47,3),
  q("disp","google",null,"hospital beds for sale near me","Phrase",4,0,54,4),
  q("disp","google",null,"Second Hand Medical Devices","Phrase",3,0,19,3),
  q("disp","google",null,"operating table","Phrase",2,0,50,2),
  q("disp","google",null,"portable blood pressure monitor","Phrase",1,0,2,1),
  q("disp","google",null,"refurbished anesthesia machines","Phrase",1,0,10,1),
  q("disp","google",null,"buy ultrasound machine","Phrase",1,0,2,1),
  q("disp","google",null,"phacoemulsifier","Phrase",0,0,2,0),
  q("disp","google",null,"portable ultrasound machine for sale","Phrase",0,0,1,0),
  q("disp","google",null,"at home ultrasound machine","Phrase",0,0,1,0),
  q("disp","google",null,"ultrasound machine for sale","Phrase",0,0,21,0),
  q("disp","google",null,"portable ultrasound machine","Phrase",0,0,1,0),
  q("disp","google",null,"bulk medical supplies","Phrase",0,0,3,0),
  q("disp","google",null,"exam bed","Phrase",0,0,2,0),
  q("disp","google",null,"patient bed","Phrase",0,0,17,0),
  q("disp","google",null,"patient monitoring system","Phrase",0,0,3,0),
  q("disp","google",null,"medical monitor","Phrase",0,0,5,0),
  q("disp","google",null,"medical endoscopes","Phrase",0,0,1,0),
  q("disp","google",null,"operating microscope","Phrase",0,0,1,0),
  q("disp","google",null,"endoscopy camera","Phrase",0,0,2,0),
  q("disp","google",null,"used microscope","Phrase",0,0,1,0),
  q("disp","google",null,"stretcher chair","Phrase",0,0,3,0),
  q("disp","google",null,"chair medical","Phrase",0,0,16,0),
  q("disp","google",null,"medical chair","Phrase",0,0,1,0),
  q("disp","google",null,"medical exam chair","Phrase",0,0,10,0),
  q("disp","google",null,"electro surgical unit","Phrase",0,0,2,0),
  q("disp","google",null,"Preowned Medical Devices","Phrase",0,0,5,0),
  q("disp","google",null,"Wholesale Medical Devices","Phrase",0,0,4,0),
  q("disp","google",null,"trimedx","Phrase",0,0,52,0),
  q("brand","google",null,"ReLink Medical","Phrase",1346,341,3010,1212),
  q("brand","google",null,"Relink Online","Phrase",119,40,335,201),
  q("mev","google",null,"used hospital equipment","Phrase",640,0,3725,411),
  q("mev","google",null,"medical equipment auction","Phrase",368,32,1304,243),
  q("mev","google",null,"used medical supplies","Phrase",81,0,891,51),
  q("mev","google",null,"medical supply auction","Phrase",46,2,159,30),
  q("mev","google",null,"dental equipment auctions","Phrase",23,0,85,15),
  q("mev","google",null,"medical device auction","Phrase",16,0,31,10),
  q("mev","google",null,"used dental equipment","Phrase",8,0,88,5),
  q("mev","google",null,"hospital equipment auctions","Phrase",3,0,19,2),
];

const SEED = { rows: [...SEED_ROWS, ...SEED_LI], keywords: SEED_KW, period: "Seeded from Google Ads and LinkedIn exports" };

const API = "/api/data";
const STATUS = {
  live:     { label: "Live",         color: "#90AD51" },
  building: { label: "Building",     color: "#F38637" },
  planned:  { label: "None running", color: "#0598A6" },
  none:     { label: "No data",      color: "#2E2622" },
};
const METRICS = [
  { key: "leads",  label: "Leads" },
  { key: "spend",  label: "Spend" },
  { key: "cpl",    label: "Cost per lead" },
  { key: "open",   label: "Open rate" },
  { key: "click",  label: "Click rate" },
  { key: "rev",    label: "Revenue" },
  { key: "roas",   label: "ROAS" },
];
const PRESETS = [
  { key: "all", label: "All time", weeks: 0 },
  { key: "4",   label: "Last 4 weeks",  weeks: 4 },
  { key: "8",   label: "Last 8 weeks",  weeks: 8 },
  { key: "13",  label: "Last 13 weeks", weeks: 13 },
];

/* ---------------- formatting ---------------- */
const cpl = (spend, leads) => (leads > 0 && spend > 0 ? spend / leads : null);
const money = (n) => (n >= 10000 ? "$" + (n / 1000).toFixed(1) + "k" : "$" + Math.round(n).toLocaleString());
const moneyFull = (n) => "$" + Math.round(n).toLocaleString();
const num = (n) => (n >= 1000000 ? (n / 1000000).toFixed(1) + "M" : n >= 10000 ? Math.round(n / 1000) + "k" : Math.round(n).toLocaleString());
const pct = (d) => (d > 0 ? "+" : "") + Math.round(d * 100) + "%";
const today = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const prettyWeek = (w) => {
  if (!w) return "";
  const [y, m, d] = w.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const prettyRange = (a, b) => (!a || !b ? "All time" : a === b ? `Week of ${prettyWeek(a)}` : `${prettyWeek(a)} \u2013 ${prettyWeek(b)}, ${b.slice(0, 4)}`);

/* ---------------- aggregation ---------------- */
/* Everything on screen comes through here. Rows in, cells out. */
function aggregate(data, from, to) {
  const inRange = (w) => (!from ? true : w ? w >= from && w <= to : false);
  const cells = {};

  const bucket = (key) => (cells[key] = cells[key] || { campaigns: {}, weeks: {}, keywords: {} });

  (data.rows || []).forEach((row) => {
    if (!inRange(row.week)) return;
    const b = bucket(`${row.s}|${row.ch}`);
    const c = (b.campaigns[row.name] = b.campaigns[row.name] || { name: row.name, spend: 0, leads: 0, reach: 0, clicks: 0, opens: 0, unsubs: 0, revenue: 0 });
    c.spend += row.spend; c.leads += row.leads; c.reach += row.reach; c.clicks += row.clicks;
    c.opens += row.opens || 0; c.unsubs += row.unsubs || 0; c.revenue += row.revenue || 0;
    if (row.week) b.weeks[row.week] = (b.weeks[row.week] || 0) + row.leads;
  });

  (data.keywords || []).forEach((row) => {
    if (!inRange(row.week)) return;
    const b = bucket(`${row.s}|${row.ch}`);
    const id = row.text.toLowerCase();
    const k = (b.keywords[id] = b.keywords[id] || { text: row.text, match: row.match, spend: 0, leads: 0, reach: 0, clicks: 0 });
    k.spend += row.spend; k.leads += row.leads; k.reach += row.reach; k.clicks += row.clicks;
  });

  const out = {};
  Object.entries(cells).forEach(([key, b]) => {
    const campaigns = Object.values(b.campaigns).filter((c) => c.spend || c.leads || c.reach || c.clicks || c.revenue);
    if (!campaigns.length) return;
    const cell = { campaigns: campaigns.sort((a, c) => c.spend - a.spend) };
    const kws = Object.values(b.keywords).filter((k) => k.spend || k.leads || k.clicks);
    if (kws.length) cell.keywords = kws.sort((a, c) => c.spend - a.spend);

    const wk = Object.keys(b.weeks).sort();
    if (wk.length >= 3) {
      const series = wk.map((w) => Math.round(b.weeks[w])).slice(-8);
      if (series.reduce((a, c) => a + c, 0) >= 8) {
        cell.trend = series;
        const half = Math.floor(series.length / 2);
        const prior = series.slice(0, half).reduce((a, c) => a + c, 0);
        const recent = series.slice(half).reduce((a, c) => a + c, 0);
        if (prior >= 5) cell.delta = (recent - prior) / prior;
      }
    }
    cell.dated = wk.length > 0;
    out[key] = cell;
  });
  return out;
}

const weeksIn = (data) => {
  const set = new Set();
  (data.rows || []).forEach((x) => x.week && set.add(x.week));
  (data.keywords || []).forEach((x) => x.week && set.add(x.week));
  return [...set].sort();
};
const undatedCount = (data) => (data.rows || []).filter((x) => !x.week).length + (data.keywords || []).filter((x) => !x.week).length;

const statusOf = (cell, key) => (cell ? "live" : NO_DATA[key] ? "planned" : "none");
function totals(cell) {
  const t = { spend: 0, leads: 0, reach: 0, clicks: 0, opens: 0, unsubs: 0, revenue: 0, count: 0 };
  if (!cell) return t;
  cell.campaigns.forEach((k) => {
    t.spend += k.spend; t.leads += k.leads; t.reach += k.reach; t.clicks += k.clicks;
    t.opens += k.opens || 0; t.unsubs += k.unsubs || 0; t.revenue += k.revenue || 0; t.count++;
  });
  return t;
}
const rate = (n, d) => (d > 0 ? (n / d) * 100 : null);
const pctText = (v) => (v === null ? "\u2014" : (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + "%");

function metricValue(key, t, ch) {
  if (key === "leads") return { text: t.leads.toLocaleString(), unit: "leads" };
  if (key === "spend") return ch.paid
    ? { text: t.spend ? money(t.spend) : "$0", unit: "spend" }
    : { text: "\u2014", unit: "no media cost" };
  if (key === "cpl") {
    const x = cpl(t.spend, t.leads);
    return { text: x ? "$" + Math.round(x) : "\u2014", unit: x ? "per lead" : "no media cost" };
  }
  if (key === "open") {
    if (ch.kind !== "email") return { text: "\u2014", unit: "not tracked here" };
    const v = rate(t.opens, t.reach);
    return { text: pctText(v), unit: "open rate" };
  }
  if (key === "rev") return t.revenue
    ? { text: money(t.revenue), unit: "revenue" }
    : { text: "\u2014", unit: "no value tracked" };
  if (key === "roas") {
    if (!t.revenue || !t.spend) return { text: "\u2014", unit: t.revenue ? "no media cost" : "no value tracked" };
    const x = t.revenue / t.spend;
    return { text: (x >= 10 ? x.toFixed(0) : x.toFixed(1)) + "x", unit: "return on spend" };
  }
  const v = rate(t.clicks, t.reach);
  return { text: pctText(v), unit: ch.kind === "email" ? "click rate" : "click-through" };
}

/* What the small line under the big number says, per channel. */
function statLine(t, ch) {
  if (ch.kind === "email") return num(t.reach) + " sent";
  if (ch.paid) return money(t.spend);
  return num(t.reach) + " " + ch.reach.toLowerCase();
}

/* ---------------- storage ---------------- */
async function loadRemote() {
  const res = await fetch(API, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("load failed");
  return res.json();
}
async function saveRemote(payload) {
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Save failed.");
  return out;
}

/* ---------------- file decoding ---------------- */
function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  let nul = 0; const n = Math.min(b.length, 600);
  for (let i = 1; i < n; i += 2) if (b[i] === 0) nul++;
  if (nul > n / 5) return new TextDecoder("utf-16le").decode(buf);
  return new TextDecoder("utf-8").decode(buf).replace(/^\ufeff/, "");
}
function detectDelim(text) {
  const head = text.split("\n").slice(0, 10).join("\n");
  const t = (head.match(/\t/g) || []).length, s = (head.match(/;/g) || []).length, c = (head.match(/,/g) || []).length;
  if (t > 0 && t >= c && t >= s) return "\t";
  return s > c ? ";" : ",";
}
function parseDelimited(text, d) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((x) => x.some((y) => String(y).trim() !== ""));
}

const ALIASES = {
  sbu:      ["sbu", "business unit", "businessunit", "unit", "brand", "product line"],
  channel:  ["channel", "media channel", "source", "platform"],
  campaign: ["campaign", "campaign name", "name", "ad group", "asset",
             "email name", "send name", "job name", "message name", "asset name", "journey", "send"],
  type:     ["campaign type", "type", "advertising channel type", "campaign subtype"],
  spend:    ["spend", "cost", "amount spent", "media spend", "budget spent", "total spend",
             "total spent", "total spent usd", "amount spent usd", "spent", "cost usd"],
  leads:    ["leads", "conversions", "conv", "conversion", "form fills", "submissions",
             "all conv", "all conversions", "key results", "results", "lead form completions"],
  reach:    ["reach", "impr", "impressions", "sends", "delivered", "touches", "views", "sent"],
  revenue:  ["conv value", "conv value all", "conversion value", "total revenue", "revenue",
             "purchase revenue", "item revenue", "all conv value", "value"],
  clicks:   ["clicks", "link clicks", "unique clicks", "interactions", "total clicks"],
  week:     ["week", "date", "week start", "week of", "day", "month", "period",
             "start date", "start date in utc", "day start", "reporting starts", "date start"],
  keyword:  ["keyword", "search keyword", "keyword text", "search term", "search terms", "query"],
  match:    ["match type", "search keyword match type", "keyword match type", "search term match type"],
  opens:    ["opens", "unique opens", "total opens", "opened", "unique open", "open"],
  unsubs:   ["unsubscribes", "unsubs", "unsubscribe", "opt outs", "optouts", "unsubscribed"],
};

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\u00ae|\u2122/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const numOf = (s) => {
  const n = parseFloat(String(s == null ? "" : s).replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return isFinite(n) ? n : 0;
};
function weekBucket(v) {
  const raw = String(v || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function findHeaderRow(rows) {
  const flat = Object.values(ALIASES).flat();
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const score = rows[i].filter((c) => flat.includes(norm(c))).length;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 2 ? best : -1;
}
function matchKey(list, raw) {
  const v = norm(raw);
  if (!v) return null;
  const hit = list.find((x) => norm(x.key) === v || norm(x.name) === v);
  if (hit) return hit.key;
  const p = list.find((x) => norm(x.name).includes(v) || v.includes(norm(x.name)));
  return p ? p.key : null;
}
const ruleMatch = (rules, text, field) => {
  const v = norm(text);
  const hit = rules.find((x) => v.includes(norm(x.match)));
  return hit ? hit[field] : null;
};
const isTotalRow = (name) => {
  const v = norm(name);
  return !v || v === "--" || v.startsWith("total") || v.startsWith("grand total");
};

/* Returns dated rows, not totals. */
function parseFile(text, opts = {}) {
  const assign = opts.assign || {};
  const raw = parseDelimited(text, detectDelim(text));
  const h = findHeaderRow(raw);
  if (h < 0) return { error: "Couldn't find a header row. Make sure the file still has its column titles." };

  const header = raw[h].map(norm);
  const col = {};
  Object.entries(ALIASES).forEach(([f, names]) => { col[f] = header.findIndex((x) => names.includes(x)); });
  if (col.campaign < 0) return { error: "No campaign column found. The export needs a Campaign column." };

  const isKw = col.keyword >= 0;
  const out = [], unmapped = {}, weeks = new Set();
  let used = 0, skippedEmpty = 0, skippedTotals = 0;

  raw.slice(h + 1).forEach((rw) => {
    const camp = String(rw[col.campaign] || "").trim();
    const label = isKw
      ? String(rw[col.keyword] || "").trim().replace(/^"+|"+$/g, "").replace(/^\[|\]$/g, "").trim()
      : camp;
    if (isTotalRow(label) || (isKw && isTotalRow(camp))) { skippedTotals++; return; }

    const spend  = col.spend  >= 0 ? numOf(rw[col.spend])  : 0;
    const leads  = col.leads  >= 0 ? numOf(rw[col.leads])  : 0;
    const reach  = col.reach  >= 0 ? numOf(rw[col.reach])  : 0;
    const clicks = col.clicks >= 0 ? numOf(rw[col.clicks]) : 0;
    const opens  = col.opens  >= 0 ? numOf(rw[col.opens])  : 0;
    const unsubs = col.unsubs >= 0 ? numOf(rw[col.unsubs]) : 0;
    const revenue = col.revenue >= 0 ? numOf(rw[col.revenue]) : 0;
    if (!spend && !leads && !reach && !clicks && !opens && !revenue) { skippedEmpty++; return; }

    let s = col.sbu >= 0 ? matchKey(SBUS, rw[col.sbu]) : null;
    if (!s) s = ruleMatch(CAMPAIGN_RULES, camp, "sbu");
    if (!s) s = assign[camp] || null;

    let ch = opts.channel || null;
    if (!ch) ch = col.channel >= 0 ? matchKey(CHANNELS, rw[col.channel]) : null;
    if (!ch && col.type >= 0) ch = ruleMatch(TYPE_RULES, rw[col.type], "channel");
    if (!ch) ch = "google";

    if (!s) {
      const u = (unmapped[camp] = unmapped[camp] || { name: camp, spend: 0, leads: 0 });
      u.spend += spend; u.leads += leads;
      return;
    }

    const week = col.week >= 0 ? weekBucket(rw[col.week]) : null;
    if (week) weeks.add(week);
    out.push(isKw
      ? { s, ch, week, text: label, match: col.match >= 0 ? String(rw[col.match] || "").trim() : "", spend, leads: Math.round(leads), reach, clicks }
      : { s, ch, week, name: label, spend, leads: Math.round(leads), reach, clicks, opens, unsubs, revenue });
    used++;
  });

  if (!out.length) return { error: "No rows matched a business unit. Assign them below or add a rule to CAMPAIGN_RULES." };

  const wk = [...weeks].sort();
  return {
    kind: isKw ? "keywords" : "campaigns",
    rows: out,
    unmapped: Object.values(unmapped).sort((a, b) => b.spend - a.spend),
    stats: {
      used, skippedEmpty, skippedTotals,
      items: new Set(out.map((x) => x.text || x.name)).size,
      cells: new Set(out.map((x) => `${x.s}|${x.ch}`)).size,
      weeks: wk.length,
      span: wk.length ? `${prettyWeek(wk[0])} \u2013 ${prettyWeek(wk[wk.length - 1])}` : null,
    },
  };
}

const TEMPLATE = [
  "sbu,channel,campaign,spend,leads,impressions,clicks,week",
  "reLink Ready,Google Ads,Ready Products - Rental,1620,40,6100,540,2026-07-06",
  "reLink Ready,Google Ads,Ready Products - Rental,1580,38,5900,520,2026-07-13",
  "Disposition,Paid Social,LinkedIn - IDN Decision Makers,2400,9,44000,610,2026-07-06",
].join("\n");

function download(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
const toCSV = (rows) => rows.map((x) => x.map(csvCell).join(",")).join("\n");

/* ---------------- small pieces ---------------- */
function Spark({ data, color }) {
  if (!data || data.length < 2) return null;
  const w = 100, h = 26, min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / span) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg className="mg-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d + ` L${w} ${h} L0 ${h} Z`} fill={color} opacity=".1" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
const Kpi = ({ label, value, sub }) => (
  <div className="mg-kpi">
    <span className="mg-kpi-label">{label}</span>
    <span className="mg-kpi-value">{value}</span>
    {sub && <span className="mg-kpi-sub">{sub}</span>}
  </div>
);
function TrendChart({ data, color }) {
  if (!data) return null;
  const max = Math.max(...data);
  return (
    <div className="mg-trend">
      <div className="mg-trend-bars">
        {data.map((v, i) => (
          <div className="mg-trend-col" key={i} title={`Week ${i + 1}: ${v} leads`}>
            <span style={{ height: `${(v / max) * 100}%`, background: color, opacity: i === data.length - 1 ? 1 : 0.42 }} />
          </div>
        ))}
      </div>
      <div className="mg-trend-axis"><span>{data.length} weeks ago</span><span>Last week</span></div>
    </div>
  );
}

/* ---------------- date range control ---------------- */
function RangeBar({ weeks, from, to, preset, onPreset, onCustom, undated, filtering }) {
  if (!weeks.length) return null;
  const first = weeks[0], last = weeks[weeks.length - 1];
  return (
    <div className="mg-range">
      <span className="mg-range-label">Date range</span>
      <div className="mg-range-pills">
        {PRESETS.filter((p) => !p.weeks || p.weeks <= weeks.length + 4).map((p) => (
          <button key={p.key} className={"mg-mpill" + (preset === p.key ? " is-on" : "")} onClick={() => onPreset(p.key)} aria-pressed={preset === p.key}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mg-range-dates">
        <input type="date" value={from || first} min={first} max={last}
          onChange={(e) => onCustom(e.target.value, to || last)} aria-label="From week" />
        <span className="mg-range-dash">&ndash;</span>
        <input type="date" value={to || last} min={first} max={last}
          onChange={(e) => onCustom(from || first, e.target.value)} aria-label="To week" />
      </div>
      <span className="mg-range-note">
        {weeks.length} week{weeks.length === 1 ? "" : "s"} of dated data
        {undated > 0 && (filtering
          ? ` \u00b7 ${undated.toLocaleString()} undated rows hidden`
          : ` \u00b7 ${undated.toLocaleString()} undated rows included`)}
      </span>
    </div>
  );
}

/* ---------------- publish ---------------- */
function PublishModal({ onClose, onDone, data, snapshots }) {
  const [key, setKey] = useState("");
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const go = async () => {
    setBusy(true); setError(null);
    try {
      const out = await saveRemote({ key, by, rows: data.rows, keywords: data.keywords, period: data.period });
      onDone({ savedAt: new Date().toISOString(), by }, out);
    } catch (e) { setError(e.message || "Save failed."); setBusy(false); }
  };
  return (
    <div className="mg-modal-wrap" onClick={onClose}>
      <div className="mg-modal is-narrow" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Publish to the team">
        <button className="mg-modal-x" onClick={onClose} aria-label="Close">&times;</button>
        <p className="mg-dr-crumb">Publish</p>
        <h2 className="mg-modal-title">Save this to the team</h2>
        <p className="mg-modal-sub">
          Everyone opening the grid sees this next. Rows carry their own dates, so
          each publish extends the range people can filter by.
        </p>
        <label className="mg-field">
          <span>Your name <i>optional</i></span>
          <input type="text" value={by} placeholder="Joe" onChange={(e) => setBy(e.target.value)} />
        </label>
        <label className="mg-field">
          <span>Write passphrase</span>
          <input type="password" value={key} placeholder="Required to publish" onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && key && !busy) go(); }} />
        </label>
        {error && <div className="mg-alert is-bad">{error}</div>}
        <p className="mg-modal-fine">
          {data.rows.length.toLocaleString()} campaign rows and {data.keywords.length.toLocaleString()} keyword rows.
          {snapshots > 0 && ` ${snapshots} save${snapshots === 1 ? "" : "s"} so far.`}
        </p>
        <div className="mg-modal-actions">
          <button className="mg-btn is-ghost" onClick={onClose}>Cancel</button>
          <button className="mg-btn" disabled={!key || busy} onClick={go}>{busy ? "Saving\u2026" : "Publish"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- import ---------------- */
function ImportModal({ onClose, onApply, onReset, imported }) {
  const [text, setText] = useState(null);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState("");
  const [drag, setDrag] = useState(false);
  const [channel, setChannel] = useState("");
  const [assign, setAssign] = useState({});
  const [mode, setMode] = useState("merge");
  const inputRef = useRef(null);

  const result = useMemo(() => {
    if (!text) return null;
    try { const out = parseFile(text, { channel: channel || null, assign }); return out.error ? null : out; }
    catch (e) { return null; }
  }, [text, channel, assign]);

  const handleFile = (file) => {
    if (!file) return;
    setFilename(file.name); setError(null); setText(null); setAssign({}); setChannel("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const decoded = decodeBuffer(reader.result);
        const probe = parseFile(decoded);
        if (probe.error) { setError(probe.error); return; }
        setChannel(/linked ?in/i.test(file.name) ? "social"
          : /facebook|meta|instagram/i.test(file.name) ? "social"
          : /sfmc|journey|send/i.test(file.name) ? "email" : "");
        setText(decoded);
      } catch (e) { setError("That file couldn't be read. Try re-downloading it from the platform."); }
    };
    reader.onerror = () => setError("That file couldn't be read. Try re-downloading it.");
    reader.readAsArrayBuffer(file);
  };

  const unmapped = result?.unmapped || [];
  const unmappedSpend = unmapped.reduce((a, u) => a + u.spend, 0);

  return (
    <div className="mg-modal-wrap" onClick={onClose}>
      <div className="mg-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import campaign data">
        <button className="mg-modal-x" onClick={onClose} aria-label="Close">&times;</button>
        <p className="mg-dr-crumb">Data</p>
        <h2 className="mg-modal-title">Import campaign data</h2>
        <p className="mg-modal-sub">
          Drop the raw export from Google Ads, LinkedIn or SFMC. Title rows, tab separation
          and UTF-16 are handled. Segment the export by week and the rows arrive dated,
          which is what makes the date filter work.
        </p>

        <div className={"mg-drop" + (drag ? " is-over" : "")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}>
          <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => handleFile(e.target.files[0])} />
          <p className="mg-drop-main">{filename || "Drop a file here, or choose one"}</p>
          <p className="mg-drop-sub">Campaign reports and keyword reports both work</p>
        </div>

        {error && <div className="mg-alert is-bad">{error}</div>}

        {result && (
          <div className="mg-alert is-good">
            <strong>
              {result.kind === "keywords" ? "Keyword report: " : ""}
              {result.stats.items.toLocaleString()} {result.kind === "keywords" ? "keywords" : "campaigns"} across {result.stats.cells} cells.
            </strong>
            <span>
              {result.stats.used.toLocaleString()} rows used.
              {result.stats.skippedEmpty > 0 && ` ${result.stats.skippedEmpty.toLocaleString()} with no activity skipped.`}
              {result.stats.weeks > 0
                ? ` Dated: ${result.stats.weeks} weeks, ${result.stats.span}.`
                : " No date column, so these rows can't be filtered by range."}
            </span>
            {unmapped.length > 0 && <span className="mg-alert-warn">{unmapped.length} campaign{unmapped.length === 1 ? "" : "s"} still unassigned &mdash; see below.</span>}
          </div>
        )}

        {result && (
          <>
            <h3 className="mg-dr-h3">Channel</h3>
            <div className="mg-chsel">
              {[{ key: "", name: "Auto-detect" }, ...CHANNELS].map((ch) => (
                <button key={ch.key || "auto"} className={"mg-chpill" + (channel === ch.key ? " is-on" : "")} onClick={() => setChannel(ch.key)}>{ch.name}</button>
              ))}
            </div>
            <h3 className="mg-dr-h3">Add or replace</h3>
            <div className="mg-chsel">
              <button className={"mg-chpill" + (mode === "merge" ? " is-on" : "")} onClick={() => setMode("merge")}>Add to what&rsquo;s here</button>
              <button className={"mg-chpill" + (mode === "replace" ? " is-on" : "")} onClick={() => setMode("replace")}>Replace everything</button>
            </div>
            <p className="mg-modal-fine">
              Adding keeps other channels intact and overwrites only the weeks this file covers.
              Replacing wipes the grid and starts from this file alone.
            </p>
          </>
        )}

        {unmapped.length > 0 && (
          <>
            <h3 className="mg-dr-h3">Assign {unmapped.length} unmatched campaign{unmapped.length === 1 ? "" : "s"}</h3>
            <p className="mg-modal-fine">
              No naming rule matched these. Assign them here, or add a line to CAMPAIGN_RULES so
              future imports handle them on their own.
              {unmappedSpend > 0 && ` ${moneyFull(unmappedSpend)} is sitting in this list.`}
            </p>
            <div className="mg-assign">
              {unmapped.slice(0, 30).map((u) => (
                <div className="mg-assign-row" key={u.name}>
                  <span className="mg-assign-name">{u.name}<i>{u.spend ? moneyFull(u.spend) : "no spend"} &middot; {Math.round(u.leads)} leads</i></span>
                  <select className="mg-assign-sel" value={assign[u.name] || ""} onChange={(e) => setAssign((a) => ({ ...a, [u.name]: e.target.value }))}>
                    <option value="">Skip</option>
                    {SBUS.map((sb) => <option key={sb.key} value={sb.key}>{sb.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {unmapped.length > 30 && <p className="mg-modal-fine">Showing the 30 largest by spend.</p>}
          </>
        )}

        <div className="mg-modal-actions">
          <button className="mg-btn is-ghost" onClick={() => download("mosaic-grid-template.csv", TEMPLATE)}>Download template</button>
          {imported && <button className="mg-btn is-ghost" onClick={onReset}>Back to seeded data</button>}
          <button className="mg-btn" disabled={!result} onClick={() => result && onApply(result, filename, mode)}>
            {mode === "replace" ? "Replace data" : "Add to grid"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- app ---------------- */
export default function App() {
  const [data, setData] = useState(SEED);
  const [dirty, setDirty] = useState(false);
  const [meta, setMeta] = useState(null);
  const [online, setOnline] = useState(null);
  const [saves, setSaves] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [sel, setSel] = useState(null);
  const [metric, setMetric] = useState("leads");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [preset, setPreset] = useState("all");
  const [custom, setCustom] = useState(null);

  useEffect(() => {
    let dead = false;
    loadRemote()
      .then((out) => {
        if (dead) return;
        setOnline(true);
        setSaves(out.saves || 0);
        if (out.data?.rows?.length) {
          setData({ rows: out.data.rows, keywords: out.data.keywords || [], period: out.data.period || "" });
          setMeta({ savedAt: out.data.savedAt, by: out.data.by });
        }
      })
      .catch(() => { if (!dead) setOnline(false); });
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 980px)");
    const sync = () => setNarrow(mq.matches);
    sync(); mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setSel(null); setShowImport(false); setShowPublish(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const weeks = useMemo(() => weeksIn(data), [data]);
  const undated = useMemo(() => undatedCount(data), [data]);

  const [from, to] = useMemo(() => {
    if (!weeks.length) return [null, null];
    if (custom) return [custom.from, custom.to];
    const p = PRESETS.find((x) => x.key === preset);
    if (!p || !p.weeks) return [null, null];
    return [weeks[Math.max(0, weeks.length - p.weeks)], weeks[weeks.length - 1]];
  }, [weeks, preset, custom]);

  const filtering = Boolean(from);
  const cells = useMemo(() => aggregate(data, from, to), [data, from, to]);
  const get = (s, ch) => cells[`${s}|${ch}`] || null;
  const period = filtering ? prettyRange(from, to) : data.period || "All time";

  const roll = useMemo(() => {
    const bySbu = {}, byChannel = {}, all = { spend: 0, leads: 0, count: 0, revenue: 0, gaps: 0 };
    SBUS.forEach((s) => (bySbu[s.key] = { spend: 0, leads: 0, count: 0, revenue: 0, liveChannels: 0 }));
    CHANNELS.forEach((ch) => (byChannel[ch.key] = { spend: 0, leads: 0, count: 0, revenue: 0, liveSbus: 0 }));
    SBUS.forEach((s) => CHANNELS.forEach((ch) => {
      const cell = cells[`${s.key}|${ch.key}`] || null, t = totals(cell);
      if (!cell) all.gaps++;
      bySbu[s.key].spend += t.spend; bySbu[s.key].leads += t.leads; bySbu[s.key].count += t.count; bySbu[s.key].revenue += t.revenue;
      byChannel[ch.key].spend += t.spend; byChannel[ch.key].leads += t.leads; byChannel[ch.key].count += t.count; byChannel[ch.key].revenue += t.revenue;
      if (cell) { bySbu[s.key].liveChannels++; byChannel[ch.key].liveSbus++; }
      all.spend += t.spend; all.leads += t.leads; all.count += t.count; all.revenue += t.revenue;
    }));
    return { bySbu, byChannel, all };
  }, [cells]);

  const maxSbuLeads = Math.max(...SBUS.map((s) => roll.bySbu[s.key].leads), 1);

  const view = useMemo(() => {
    if (!sel) return null;
    if (sel.type === "cell") {
      const s = SBUS.find((x) => x.key === sel.s), ch = CHANNELS.find((x) => x.key === sel.ch);
      const key = `${s.key}|${ch.key}`, cell = cells[key] || null, st = statusOf(cell, key);
      return { kind: "cell", s, ch, cell, st, key, t: totals(cell), color: STATUS[st].color,
        crumb: `${s.name} / ${ch.name}`, title: ch.name, sub: s.name, file: `mosaic-${s.key}-${ch.key}` };
    }
    if (sel.type === "sbu") {
      const s = SBUS.find((x) => x.key === sel.s);
      return { kind: "sbu", s, r: roll.bySbu[s.key], color: "#F38637", crumb: "Business unit", title: s.name, sub: s.owner, file: `mosaic-${s.key}` };
    }
    const ch = CHANNELS.find((x) => x.key === sel.ch);
    return { kind: "channel", ch, r: roll.byChannel[ch.key], color: "#0598A6", crumb: "Channel", title: ch.name, sub: ch.note, file: `mosaic-${ch.key}` };
  }, [sel, cells, roll]);

  const exportCSV = () => {
    if (!view) return;
    let rows;
    if (view.kind === "cell") {
      rows = [["Business unit", "Channel", "Level", "Name", "Match", "Spend", "Leads", "Cost per lead", view.ch.reach, "Clicks", "Opens", "Open rate", "Click rate", "Unsubscribes", "Revenue", "ROAS", "Range"]];
      (view.cell?.campaigns || []).forEach((k) => {
        const x = cpl(k.spend, k.leads);
        const orr = rate(k.opens, k.reach), crr = rate(k.clicks, k.reach);
        rows.push([view.s.name, view.ch.name, view.ch.unit === "email" ? "Email" : "Campaign", k.name, "",
          Math.round(k.spend), k.leads, x ? Math.round(x) : "", Math.round(k.reach), Math.round(k.clicks),
          Math.round(k.opens || 0), orr === null ? "" : orr.toFixed(1), crr === null ? "" : crr.toFixed(1),
          Math.round(k.unsubs || 0), Math.round(k.revenue || 0),
          k.revenue && k.spend ? (k.revenue / k.spend).toFixed(2) : "", period]);
      });
      (view.cell?.keywords || []).forEach((k) => {
        const x = cpl(k.spend, k.leads);
        rows.push([view.s.name, view.ch.name, "Keyword", k.text, k.match, Math.round(k.spend), k.leads, x ? Math.round(x) : "", Math.round(k.reach), Math.round(k.clicks), period]);
      });
    } else {
      const isSbu = view.kind === "sbu", list = isSbu ? CHANNELS : SBUS;
      rows = [[isSbu ? "Business unit" : "Channel", isSbu ? "Channel" : "Business unit", "Campaigns", "Spend", "Leads", "Cost per lead", "Range"]];
      list.forEach((item) => {
        const key = isSbu ? `${view.s.key}|${item.key}` : `${item.key}|${view.ch.key}`;
        const t = totals(cells[key]), x = cpl(t.spend, t.leads);
        rows.push([view.title, item.name, t.count, Math.round(t.spend), t.leads, x ? Math.round(x) : "", period]);
      });
    }
    download(view.file + ".csv", toCSV(rows));
  };

  const Cell = ({ s, ch }) => {
    const key = `${s.key}|${ch.key}`, cell = cells[key] || null;
    const st = statusOf(cell, key), t = totals(cell);
    const isSel = sel?.type === "cell" && sel.s === s.key && sel.ch === ch.key;
    const m = metricValue(metric, t, ch);
    const up = (cell?.delta ?? 0) >= 0;
    const trendColor = up ? "#90AD51" : "#F38637";
    return (
      <button
        className={"mg-cell" + (cell ? "" : " is-quiet") + (st === "none" ? " is-gap" : "") + (isSel ? " is-sel" : "") + (gapsOnly && cell ? " is-dim" : "")}
        style={{ "--c": STATUS[st].color }}
        onClick={() => setSel(isSel ? null : { type: "cell", s: s.key, ch: ch.key })}
        aria-label={`${s.name}, ${ch.name}: ${cell ? `${t.leads} leads, ${moneyFull(t.spend)} spend` : STATUS[st].label}`}
      >
        {cell ? (
          <>
            <span className="mg-cell-top"><span className="mg-dot" /><span className="mg-cell-count">{t.count} {ch.unit}{t.count === 1 ? "" : "s"}</span></span>
            <span className="mg-cell-metric"><b>{m.text}</b><i>{m.unit}</i></span>
            <span className="mg-cell-row">
              <span className="mg-cell-spend">{statLine(t, ch)}</span>
              {cell.delta !== undefined && <span className="mg-delta" style={{ color: trendColor }}>{up ? "\u25B2" : "\u25BC"} {pct(cell.delta).replace("+", "")}</span>}
              {!cell.dated && <span className="mg-period-flag" title="Undated rows — not affected by the date filter">undated</span>}
            </span>
            <Spark data={cell.trend} color={trendColor} />
          </>
        ) : st === "none" ? <span className="mg-gap-mark">&mdash;</span> : (
          <>
            <span className="mg-cell-top"><span className="mg-dot" /><span className="mg-cell-count">{STATUS[st].label}</span></span>
            <span className="mg-quiet-note">{NO_DATA[key]}</span>
          </>
        )}
      </button>
    );
  };

  function Report({ print }) {
    if (!view) return null;
    if (view.kind === "cell") {
      const { s, ch, cell, st, t, color, key } = view;
      const x = cpl(t.spend, t.leads);
      const ctr = t.reach ? (t.clicks / t.reach) * 100 : null;
      if (!cell)
        return (
          <>
            <div className="mg-dr-empty">
              <p>{NO_DATA[key] || `Nothing for ${s.name} on ${ch.name} in this range.`}</p>
              <p className="mg-dr-empty-sub">{filtering ? "Widen the date range, or import a file covering these weeks." : "Import a file with rows for this pair."}</p>
            </div>
            <BenchmarkPanel channel={ch} sbu={s} totals={t} />
          </>
        );
      return (
        <>
          {ch.kind === "email" ? (
            <div className="mg-kpis">
              <Kpi label="Sends" value={num(t.reach)} sub={`${t.count} email${t.count === 1 ? "" : "s"}`} />
              <Kpi label="Open rate" value={pctText(rate(t.opens, t.reach))} sub={t.opens ? `${Math.round(t.opens).toLocaleString()} opens` : "no open data"} />
              <Kpi label="Click rate" value={pctText(rate(t.clicks, t.reach))} sub={t.clicks ? `${Math.round(t.clicks).toLocaleString()} clicks` : null} />
              <Kpi label="Leads" value={t.leads.toLocaleString()} sub={cell.delta !== undefined ? pct(cell.delta) + " vs prior weeks" : null} />
            </div>
          ) : (
            <div className="mg-kpis">
              <Kpi label="Leads" value={t.leads.toLocaleString()} sub={cell.delta !== undefined ? pct(cell.delta) + " vs prior weeks" : null} />
              <Kpi label="Spend" value={t.spend ? moneyFull(t.spend) : "\u2014"} sub={ch.paid ? "paid media" : "no media cost"} />
              <Kpi label="Cost per lead" value={x ? "$" + Math.round(x) : "\u2014"} sub={x ? null : "owned channel"} />
              <Kpi label={ch.reach} value={num(t.reach)} sub={ctr ? ctr.toFixed(2) + "% click rate" : null} />
              {t.revenue > 0 && <Kpi label="Revenue" value={moneyFull(t.revenue)} sub={`${moneyFull(t.revenue / t.leads)} per lead`} />}
              {t.revenue > 0 && t.spend > 0 && <Kpi label="ROAS" value={(t.revenue / t.spend).toFixed(1) + "x"} sub="tracked value over spend" />}
            </div>
          )}
          {ch.kind === "email" && t.opens > 0 && (() => {
            const ctor = rate(t.clicks, t.opens);
            const unsub = rate(t.unsubs, t.reach);
            return (
              <p className="mg-note">
                {pctText(ctor)} of opens clicked through.
                {t.unsubs > 0 && ` ${Math.round(t.unsubs).toLocaleString()} unsubscribes, ${pctText(unsub)} of sends.`}
              </p>
            );
          })()}
          <BenchmarkPanel channel={ch} sbu={s} totals={t} />
          {cell.trend && (<><h3 className="mg-dr-h3">Leads by week</h3><TrendChart data={cell.trend} color={color} /></>)}
          {!cell.dated && <p className="mg-note">These rows carry no dates, so the range filter doesn&rsquo;t apply to them.</p>}
          <h3 className="mg-dr-h3">{ch.kind === "email" ? "Emails" : "Campaigns"}</h3>
          {ch.kind === "email" ? (
            <table className="mg-table mg-table-kw">
              <thead><tr><th>Email</th><th>Sent</th><th>Open</th><th>Click</th><th>Leads</th></tr></thead>
              <tbody>
                {[...cell.campaigns].sort((a, b) => b.reach - a.reach).map((k) => (
                  <tr key={k.name}>
                    <td>{k.name}</td>
                    <td>{num(k.reach)}</td>
                    <td>{pctText(rate(k.opens, k.reach))}</td>
                    <td>{pctText(rate(k.clicks, k.reach))}</td>
                    <td>{k.leads || "\u2014"}</td>
                  </tr>
                ))}
                <tr className="mg-total">
                  <td>Total</td><td>{num(t.reach)}</td>
                  <td>{pctText(rate(t.opens, t.reach))}</td>
                  <td>{pctText(rate(t.clicks, t.reach))}</td>
                  <td>{t.leads}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="mg-table">
              <thead><tr>
                <th>Campaign</th><th>Spend</th><th>Leads</th><th>CPL</th>
                {t.revenue > 0 && <th>ROAS</th>}
              </tr></thead>
              <tbody>
                {cell.campaigns.map((k) => {
                  const kx = cpl(k.spend, k.leads);
                  const kr = k.revenue && k.spend ? k.revenue / k.spend : null;
                  return (
                    <tr key={k.name} className={t.revenue > 0 && kr !== null && kr < 1 ? "is-dead" : ""}>
                      <td>{k.name}</td>
                      <td>{k.spend ? moneyFull(k.spend) : "\u2014"}</td>
                      <td>{k.leads}</td>
                      <td>{kx ? "$" + Math.round(kx) : "\u2014"}</td>
                      {t.revenue > 0 && <td>{kr ? kr.toFixed(1) + "x" : "\u2014"}</td>}
                    </tr>
                  );
                })}
                <tr className="mg-total">
                  <td>Total</td><td>{t.spend ? moneyFull(t.spend) : "\u2014"}</td><td>{t.leads}</td>
                  <td>{x ? "$" + Math.round(x) : "\u2014"}</td>
                  {t.revenue > 0 && <td>{(t.revenue / t.spend).toFixed(1) + "x"}</td>}
                </tr>
              </tbody>
            </table>
          )}
          {cell.keywords?.length > 0 && (() => {
            const kws = cell.keywords, dead = kws.filter((k) => !k.leads && k.spend > 0);
            const deadSpend = dead.reduce((a, k) => a + k.spend, 0);
            const shown = kws.slice(0, print ? 25 : 15);
            return (
              <>
                <h3 className="mg-dr-h3">Keywords by spend</h3>
                <table className="mg-table mg-table-kw">
                  <thead><tr><th>Keyword</th><th>Spend</th><th>Leads</th><th>CPL</th></tr></thead>
                  <tbody>
                    {shown.map((k) => {
                      const kx = cpl(k.spend, k.leads);
                      return (
                        <tr key={k.text} className={!k.leads && k.spend > 0 ? "is-dead" : ""}>
                          <td>{k.text}{k.match && <span className="mg-kw-match">{k.match}</span>}</td>
                          <td>{moneyFull(k.spend)}</td><td>{k.leads || "\u2014"}</td><td>{kx ? "$" + Math.round(kx) : "\u2014"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {kws.length > shown.length && <p className="mg-note">Showing the top {shown.length} of {kws.length} by spend. Export CSV for the full list.</p>}
                {deadSpend > 0 && (
                  <p className="mg-note is-flag">
                    {moneyFull(deadSpend)} across {dead.length} keyword{dead.length === 1 ? "" : "s"} with no conversions
                    &mdash; {Math.round((deadSpend / t.spend) * 100)}% of this cell&rsquo;s spend.
                  </p>
                )}
              </>
            );
          })()}
        </>
      );
    }

    const isSbu = view.kind === "sbu", list = isSbu ? CHANNELS : SBUS;
    const rr = view.r, x = cpl(rr.spend, rr.leads);
    const keyFor = (item) => (isSbu ? `${view.s.key}|${item.key}` : `${item.key}|${view.ch.key}`);
    const max = Math.max(...list.map((i) => totals(cells[keyFor(i)]).leads), 1);
    return (
      <>
        <div className="mg-kpis">
          <Kpi label="Leads" value={rr.leads.toLocaleString()} sub={isSbu ? "all channels" : "all business units"} />
          <Kpi label="Spend" value={moneyFull(rr.spend)} sub="paid media only" />
          <Kpi label="Blended CPL" value={x ? "$" + Math.round(x) : "\u2014"} />
          {rr.revenue > 0 && <Kpi label="Revenue" value={moneyFull(rr.revenue)} sub="tracked value" />}
          {rr.revenue > 0 && rr.spend > 0 && <Kpi label="ROAS" value={(rr.revenue / rr.spend).toFixed(1) + "x"} />}
          <Kpi label={isSbu ? "Live channels" : "Live for"} value={`${isSbu ? rr.liveChannels : rr.liveSbus} of ${list.length}`} sub={`${rr.count} campaigns`} />
        </div>
        <h3 className="mg-dr-h3">{isSbu ? "Where the leads come from" : "By business unit"}</h3>
        <div className="mg-bars">
          {list.map((item) => {
            const key = keyFor(item), cell = cells[key] || null, st = statusOf(cell, key), t = totals(cell);
            const Tag = print ? "div" : "button";
            return (
              <Tag className="mg-barrow" key={item.key}
                onClick={print ? undefined : () => setSel({ type: "cell", s: isSbu ? view.s.key : item.key, ch: isSbu ? item.key : view.ch.key })}>
                <span className="mg-barrow-name">{item.name}</span>
                <span className="mg-barrow-track"><span style={{ width: `${(t.leads / max) * 100}%`, background: STATUS[st].color }} /></span>
                <span className="mg-barrow-val">{cell ? t.leads : STATUS[st].label}</span>
              </Tag>
            );
          })}
        </div>
        {print && (
          <>
            <h3 className="mg-dr-h3">Detail</h3>
            <table className="mg-table">
              <thead><tr><th>{isSbu ? "Channel" : "Business unit"}</th><th>Status</th><th>Spend</th><th>Leads</th><th>CPL</th></tr></thead>
              <tbody>
                {list.map((item) => {
                  const key = keyFor(item), cell = cells[key] || null, t = totals(cell), kx = cpl(t.spend, t.leads);
                  return <tr key={item.key}><td>{item.name}</td><td>{STATUS[statusOf(cell, key)].label}</td><td>{t.spend ? moneyFull(t.spend) : "\u2014"}</td><td>{t.leads}</td><td>{kx ? "$" + Math.round(kx) : "\u2014"}</td></tr>;
                })}
                <tr className="mg-total"><td>Total</td><td /><td>{moneyFull(rr.spend)}</td><td>{rr.leads}</td><td>{x ? "$" + Math.round(x) : "\u2014"}</td></tr>
              </tbody>
            </table>
          </>
        )}
      </>
    );
  }

  const applyImport = (out, name, mode) => {
    setData((prev) => {
      const base = mode === "replace" ? { rows: [], keywords: [], period: "" } : prev;
      const isKw = out.kind === "keywords";
      const incoming = out.rows;
      const touched = new Set(incoming.map((x) => `${x.s}|${x.ch}|${x.week || ""}`));
      const keep = (list) => list.filter((x) => !touched.has(`${x.s}|${x.ch}|${x.week || ""}`));
      return {
        rows: isKw ? base.rows : [...keep(base.rows || []), ...incoming],
        keywords: isKw ? [...keep(base.keywords || []), ...incoming] : base.keywords || [],
        period: `Imported from ${name}`,
      };
    });
    setDirty(true); setSel(null); setShowImport(false); setCustom(null); setPreset("all");
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="mg-root">
        <header className="mg-head">
          <div>
            <p className="mg-eyebrow">reLink &middot; channel performance</p>
            <h1 className="mg-title">Mosaic <span>Grid</span></h1>
            <p className="mg-sub">Every business unit against every channel. Click a cell for campaigns and spend, or a heading for the whole roll-up.</p>
          </div>
          <div className="mg-head-right">
            <button className="mg-btn" onClick={() => setShowImport(true)}>Import CSV</button>
            <div className="mg-tally">
              <div className="mg-tally-item"><span className="mg-tally-num">{roll.all.leads.toLocaleString()}</span><span className="mg-tally-label">Leads</span></div>
              <div className="mg-tally-item"><span className="mg-tally-num">{money(roll.all.spend)}</span><span className="mg-tally-label">Spend</span></div>
              <div className="mg-tally-item"><span className="mg-tally-num">{roll.all.leads ? "$" + Math.round(roll.all.spend / roll.all.leads) : "\u2014"}</span><span className="mg-tally-label">Blended CPL</span></div>
              {roll.all.revenue > 0
                ? <div className="mg-tally-item"><span className="mg-tally-num" style={{ color: "#90AD51" }}>{(roll.all.revenue / roll.all.spend).toFixed(1)}x</span><span className="mg-tally-label">ROAS</span></div>
                : <div className="mg-tally-item"><span className="mg-tally-num" style={{ color: "#F38637" }}>{roll.all.gaps}</span><span className="mg-tally-label">No data</span></div>}
            </div>
          </div>
        </header>

        <RangeBar weeks={weeks} from={from} to={to} preset={custom ? "custom" : preset} undated={undated} filtering={filtering}
          onPreset={(k) => { setCustom(null); setPreset(k); }}
          onCustom={(a, b) => setCustom({ from: a <= b ? a : b, to: a <= b ? b : a })} />

        <div className="mg-bar">
          <div className="mg-metricsel" role="group" aria-label="Metric shown on each cell">
            {METRICS.map((m) => (
              <button key={m.key} className={"mg-mpill" + (metric === m.key ? " is-on" : "")} onClick={() => setMetric(m.key)} aria-pressed={metric === m.key}>{m.label}</button>
            ))}
          </div>
          <button className={"mg-toggle" + (gapsOnly ? " is-on" : "")} onClick={() => setGapsOnly((v) => !v)} aria-pressed={gapsOnly}>Highlight what isn&rsquo;t live</button>
          <span className="mg-bar-note">{period}</span>
        </div>

        <div className="mg-status">
          {online === false ? (
            <span className="mg-status-note">Working from the built-in data &mdash; storage isn&rsquo;t reachable, so nothing can be published from here.</span>
          ) : dirty ? (
            <>
              <span className="mg-status-note is-warn">New data loaded but not published. Only you can see it.</span>
              <button className="mg-btn mg-btn-sm" onClick={() => setShowPublish(true)}>Publish to team</button>
            </>
          ) : meta?.savedAt ? (
            <span className="mg-status-note">
              Published {new Date(meta.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {meta.by ? ` by ${meta.by}` : ""}{saves > 1 ? ` \u00b7 ${saves} saves` : ""}
            </span>
          ) : online ? (
            <span className="mg-status-note">Nothing published yet &mdash; this is the built-in data. Import a file, then publish it.</span>
          ) : (
            <span className="mg-status-note">Checking for saved data\u2026</span>
          )}
        </div>

        {narrow ? (
          <div className="mg-stack">
            {SBUS.map((s) => {
              const rr = roll.bySbu[s.key];
              return (
                <section className="mg-stack-card" key={s.key}>
                  <button className="mg-stack-head" onClick={() => setSel({ type: "sbu", s: s.key })}>
                    <span><h2>{s.name}</h2><p className="mg-stack-blurb">{s.blurb}</p></span>
                    <span className="mg-stack-nums"><b>{rr.leads}</b><i>leads &middot; {money(rr.spend)}</i></span>
                  </button>
                  <div className="mg-stack-rows">
                    {CHANNELS.map((ch) => <div className="mg-stack-row" key={ch.key}><span className="mg-stack-ch">{ch.name}</span><Cell s={s} ch={ch} /></div>)}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mg-scroll">
            <div className="mg-matrix" style={{ "--cols": SBUS.length }}>
              <div className="mg-corner"><span>Channel</span><span className="mg-corner-r">Business unit &rarr;</span></div>
              {SBUS.map((s) => {
                const rr = roll.bySbu[s.key];
                return (
                  <button className={"mg-colhead" + (sel?.type === "sbu" && sel.s === s.key ? " is-sel" : "")} key={s.key} onClick={() => setSel({ type: "sbu", s: s.key })}>
                    <h2 className="mg-colhead-name">{s.name}</h2>
                    <p className="mg-colhead-blurb">{s.blurb}</p>
                    <span className="mg-colhead-nums">{rr.leads} leads &middot; {money(rr.spend)}</span>
                    <span className="mg-colhead-track"><i style={{ width: `${(rr.leads / maxSbuLeads) * 100}%` }} /></span>
                  </button>
                );
              })}
              {CHANNELS.map((ch) => (
                <React.Fragment key={ch.key}>
                  <button className={"mg-rowhead" + (sel?.type === "channel" && sel.ch === ch.key ? " is-sel" : "")} onClick={() => setSel({ type: "channel", ch: ch.key })}>
                    <h3 className="mg-rowhead-name">{ch.name}</h3>
                    <p className="mg-rowhead-note">{ch.note}</p>
                    <span className="mg-rowhead-count">{roll.byChannel[ch.key].leads} leads</span>
                  </button>
                  {SBUS.map((s) => <Cell key={s.key} s={s} ch={ch} />)}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {sel && view && (
        <>
          <div className="mg-scrim" onClick={() => setSel(null)} />
          <aside className="mg-drawer" role="dialog" aria-label="Detail">
            <button className="mg-drawer-x" onClick={() => setSel(null)} aria-label="Close">&times;</button>
            <div className="mg-drawer-inner">
              <p className="mg-dr-crumb">{view.crumb}</p>
              <h2 className="mg-dr-title">{view.title}</h2>
              <div className="mg-dr-meta">
                {view.kind === "cell" && <span className="mg-dr-status" style={{ color: view.color, borderColor: view.color }}>{STATUS[view.st].label}</span>}
                <span>{view.sub}</span><span>{period}</span>
              </div>
              <div className="mg-dr-actions">
                <button className="mg-btn" onClick={() => window.print()}>Download PDF</button>
                <button className="mg-btn is-ghost" onClick={exportCSV}>Export CSV</button>
              </div>
              <Report />
            </div>
          </aside>
        </>
      )}

      {showPublish && (
        <PublishModal data={data} snapshots={saves}
          onClose={() => setShowPublish(false)}
          onDone={(m) => { setMeta(m); setDirty(false); setShowPublish(false); setSaves((n) => n + 1); }} />
      )}

      {showImport && (
        <ImportModal imported={data !== SEED}
          onClose={() => setShowImport(false)}
          onReset={() => { setData(SEED); setDirty(true); setShowImport(false); setCustom(null); setPreset("all"); }}
          onApply={applyImport} />
      )}

      {view && (
        <div className="mg-print-sheet" aria-hidden="true">
          <div className="mg-print-head">
            <div>
              <p className="mg-print-brand">reLink Medical &middot; Mosaic Grid</p>
              <h1>{view.title}</h1>
              <p className="mg-print-crumb">{view.crumb} &middot; {view.sub}</p>
            </div>
            <div className="mg-print-meta"><span>{period}</span><span>Generated {today()}</span></div>
          </div>
          <Report print />
          <p className="mg-print-foot">reLink Medical &middot; Twinsburg, Ohio &middot; {period} &middot; Generated {today()}</p>
        </div>
      )}
    </>
  );
}
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

.mg-root{--esp:#2E2622;--cream:#FAF7F1;--orange:#F38637;--teal:#0598A6;--olive:#90AD51;--line:rgba(46,38,34,.12);--mute:rgba(46,38,34,.55);
  min-height:100vh;box-sizing:border-box;padding:40px 28px 60px;background:var(--cream);color:var(--esp);
  font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.mg-root *,.mg-root *::before,.mg-root *::after{box-sizing:border-box}

.mg-head{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;flex-wrap:wrap;max-width:1420px;margin:0 auto 22px}
.mg-head-right{display:flex;flex-direction:column;align-items:flex-end;gap:18px}
.mg-eyebrow{margin:0 0 10px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--teal)}
.mg-title{margin:0;font-size:clamp(36px,5vw,54px);font-weight:300;letter-spacing:-.025em;line-height:1}
.mg-title span{font-weight:700;color:var(--orange)}
.mg-sub{margin:12px 0 0;max-width:48ch;font-size:15px;line-height:1.5;color:var(--mute)}
.mg-tally{display:flex;gap:30px}
.mg-tally-item{display:flex;flex-direction:column}
.mg-tally-num{font-size:30px;font-weight:700;line-height:1;letter-spacing:-.03em}
.mg-tally-label{margin-top:6px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.42)}

.mg-btn{padding:9px 20px;border:none;border-radius:999px;background:#F38637;color:#fff;font-family:'Source Sans 3',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .16s ease,opacity .16s ease}
.mg-btn:hover{background:#e0752a}
.mg-btn:disabled{opacity:.35;cursor:not-allowed}
.mg-btn.is-ghost{background:transparent;border:1px solid rgba(46,38,34,.18);color:rgba(46,38,34,.7)}
.mg-btn.is-ghost:hover{border-color:#2E2622;color:#2E2622;background:transparent}

.mg-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:1420px;margin:0 auto 20px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.mg-metricsel{display:flex;gap:4px;padding:3px;border:1px solid var(--line);border-radius:999px;background:#fff}
.mg-mpill{padding:6px 15px;border:none;border-radius:999px;background:transparent;font-family:inherit;font-size:13px;font-weight:600;color:var(--mute);cursor:pointer;transition:all .16s ease}
.mg-mpill.is-on{background:var(--esp);color:var(--cream)}
.mg-toggle{padding:7px 17px;border:1px solid var(--line);border-radius:999px;background:transparent;font-family:inherit;font-size:13.5px;font-weight:600;color:var(--mute);cursor:pointer;transition:all .16s ease}
.mg-toggle:hover{border-color:var(--orange);color:var(--orange)}
.mg-toggle.is-on{background:var(--orange);border-color:var(--orange);color:#fff}
.mg-bar-note{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.05em;color:rgba(46,38,34,.42)}

.mg-scroll{max-width:1420px;margin:0 auto;overflow-x:auto;padding-bottom:8px}
.mg-matrix{display:grid;grid-template-columns:180px repeat(var(--cols),minmax(158px,1fr));gap:8px;min-width:1140px}
.mg-corner{padding:8px 4px;display:flex;flex-direction:column;justify-content:flex-end;gap:3px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.32)}
.mg-corner-r{color:rgba(46,38,34,.5)}
.mg-colhead,.mg-rowhead{background:none;border:none;font-family:inherit;text-align:left;cursor:pointer;border-radius:10px;transition:background .16s ease}
.mg-colhead{padding:10px 12px 12px;display:flex;flex-direction:column}
.mg-colhead:hover,.mg-rowhead:hover{background:rgba(46,38,34,.04)}
.mg-colhead.is-sel,.mg-rowhead.is-sel{background:rgba(243,134,55,.1)}
.mg-colhead-name{margin:0;font-size:16px;font-weight:700;letter-spacing:-.015em;line-height:1.15}
.mg-colhead-blurb{margin:4px 0 0;font-size:11px;line-height:1.35;color:rgba(46,38,34,.45)}
.mg-colhead-nums{margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.06em;color:rgba(46,38,34,.55)}
.mg-colhead-track{display:block;height:3px;margin-top:6px;border-radius:2px;background:rgba(46,38,34,.1)}
.mg-colhead-track i{display:block;height:100%;border-radius:2px;background:var(--esp)}
.mg-rowhead{padding:14px 14px 14px 8px;display:flex;flex-direction:column;justify-content:center;border-right:1px solid var(--line);border-radius:10px 0 0 10px}
.mg-rowhead-name{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}
.mg-rowhead-note{margin:3px 0 0;font-size:11px;color:rgba(46,38,34,.42)}
.mg-rowhead-count{margin-top:7px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(46,38,34,.32)}

.mg-cell{--c:#2E2622;position:relative;display:flex;flex-direction:column;align-items:stretch;min-height:132px;padding:11px 12px 9px;border:1px solid var(--line);border-radius:11px;background:#fff;font-family:inherit;text-align:left;cursor:pointer;overflow:hidden;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,opacity .16s ease}
.mg-cell::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c);transition:width .28s cubic-bezier(.2,.7,.3,1),opacity .28s ease}
.mg-cell:hover{transform:translateY(-2px);border-color:var(--c);box-shadow:0 10px 22px -15px rgba(46,38,34,.5)}
.mg-cell:hover::before{width:100%;opacity:.07}
.mg-cell:focus-visible,.mg-colhead:focus-visible,.mg-rowhead:focus-visible,.mg-barrow:focus-visible,.mg-mpill:focus-visible,.mg-toggle:focus-visible,.mg-btn:focus-visible,.mg-drawer-x:focus-visible,.mg-modal-x:focus-visible,.mg-drop:focus-visible{outline:2px solid #0598A6;outline-offset:2px}
.mg-cell.is-sel{border-color:var(--c);box-shadow:0 0 0 2px var(--c) inset}
.mg-cell.is-dim{opacity:.24}
.mg-cell.is-quiet{background:rgba(255,255,255,.55)}
.mg-cell.is-gap{background:transparent;border-style:dashed;border-color:rgba(46,38,34,.18);align-items:center;justify-content:center}
.mg-cell.is-gap::before{display:none}
.mg-cell.is-gap:hover{border-color:var(--orange);transform:none;box-shadow:none}
.mg-gap-mark{font-size:17px;color:rgba(46,38,34,.2)}
.mg-cell-top{display:flex;align-items:center;gap:6px}
.mg-dot{width:6px;height:6px;border-radius:50%;background:var(--c);flex-shrink:0}
.mg-cell-count{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(46,38,34,.42)}
.mg-cell-metric{display:flex;align-items:baseline;gap:5px;margin-top:9px}
.mg-cell-metric b{font-size:26px;font-weight:700;letter-spacing:-.03em;line-height:1}
.mg-cell-metric i{font-style:normal;font-size:10.5px;color:rgba(46,38,34,.45)}
.mg-cell-row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:5px;margin-bottom:6px}
.mg-cell-spend{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:rgba(46,38,34,.5)}
.mg-delta{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:500}
.mg-period-flag{font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.09em;text-transform:uppercase;color:#0598A6;border:1px solid rgba(5,152,166,.4);border-radius:999px;padding:2px 7px;white-space:nowrap}
.mg-spark{width:100%;height:26px;margin-top:auto;display:block}
.mg-quiet-note{margin-top:8px;font-size:11.5px;line-height:1.4;color:rgba(46,38,34,.45)}

.mg-stack{max-width:1420px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.mg-stack-card{padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff}
.mg-stack-head{display:flex;width:100%;align-items:flex-start;justify-content:space-between;gap:12px;padding:0 0 12px;background:none;border:none;border-bottom:1px solid var(--line);font-family:inherit;text-align:left;cursor:pointer}
.mg-stack-head h2{margin:0;font-size:18px;font-weight:700;letter-spacing:-.015em}
.mg-stack-blurb{margin:4px 0 0;font-size:12px;color:rgba(46,38,34,.45)}
.mg-stack-nums{text-align:right;flex-shrink:0}
.mg-stack-nums b{display:block;font-size:22px;font-weight:700;letter-spacing:-.02em}
.mg-stack-nums i{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.08em;color:rgba(46,38,34,.42)}
.mg-stack-rows{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.mg-stack-row{display:grid;grid-template-columns:104px 1fr;gap:10px}
.mg-stack-ch{align-self:center;font-size:13.5px;font-weight:600;color:var(--mute)}
.mg-stack-row .mg-cell{min-height:112px}

/* drawer + modal */
.mg-scrim{position:fixed;inset:0;background:rgba(46,38,34,.42);z-index:50;animation:mg-fade .2s ease}
.mg-drawer{position:fixed;top:0;right:0;bottom:0;width:min(540px,100vw);z-index:51;background:#FAF7F1;border-left:3px solid #F38637;box-shadow:-20px 0 50px -30px rgba(46,38,34,.7);overflow-y:auto;animation:mg-slide .28s cubic-bezier(.2,.7,.3,1);font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;color:#2E2622}
.mg-drawer *,.mg-modal *{box-sizing:border-box}
.mg-drawer-inner{padding:30px 32px 48px}
.mg-drawer-x,.mg-modal-x{position:absolute;top:16px;right:18px;width:32px;height:32px;border:none;border-radius:50%;background:rgba(46,38,34,.07);color:#2E2622;font-size:20px;line-height:1;cursor:pointer}
.mg-drawer-x:hover,.mg-modal-x:hover{background:rgba(46,38,34,.14)}
.mg-dr-crumb{margin:0 0 6px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.mg-dr-title{margin:0;font-size:30px;font-weight:700;letter-spacing:-.025em;line-height:1.05}
.mg-dr-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0 18px;font-size:12.5px;color:rgba(46,38,34,.5)}
.mg-dr-status{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;border:1px solid;border-radius:999px;padding:4px 11px}
.mg-dr-actions{display:flex;gap:8px;margin-bottom:26px;padding-bottom:22px;border-bottom:1px solid rgba(46,38,34,.12)}
.mg-kpis{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mg-kpi{padding:14px 15px;border:1px solid rgba(46,38,34,.12);border-radius:11px;background:#fff;display:flex;flex-direction:column}
.mg-kpi-label{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.42)}
.mg-kpi-value{margin-top:7px;font-size:25px;font-weight:700;letter-spacing:-.03em;line-height:1}
.mg-kpi-sub{margin-top:5px;font-size:11.5px;color:rgba(46,38,34,.45)}
.mg-dr-h3{margin:30px 0 12px;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.mg-trend{padding:14px 15px;border:1px solid rgba(46,38,34,.12);border-radius:11px;background:#fff}
.mg-trend-bars{display:flex;align-items:flex-end;gap:5px;height:88px}
.mg-trend-col{flex:1;height:100%;display:flex;align-items:flex-end}
.mg-trend-col span{width:100%;border-radius:3px 3px 0 0;min-height:3px}
.mg-trend-axis{display:flex;justify-content:space-between;margin-top:9px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:rgba(46,38,34,.35)}
.mg-table{width:100%;border-collapse:collapse;font-size:13.5px}
.mg-table th{text-align:left;padding:0 10px 8px 0;font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:rgba(46,38,34,.4);border-bottom:1px solid rgba(46,38,34,.12)}
.mg-table th:not(:first-child),.mg-table td:not(:first-child){text-align:right;white-space:nowrap}
.mg-table td{padding:11px 10px 11px 0;border-bottom:1px solid rgba(46,38,34,.12)}
.mg-table td:first-child{font-weight:600;padding-right:14px}
.mg-table tr.mg-total td{font-weight:700;border-bottom:none;border-top:2px solid rgba(46,38,34,.2)}
.mg-table-kw td{padding:8px 8px 8px 0;font-size:12.5px}
.mg-table-kw td:first-child{font-weight:600;word-break:break-word;padding-right:12px;line-height:1.3}
.mg-table-kw tr.is-dead td{color:rgba(46,38,34,.42)}
.mg-table-kw tr.is-dead td:first-child{font-weight:500}
.mg-kw-match{display:block;margin-top:2px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(46,38,34,.38)}
.mg-note{margin:10px 0 0;font-size:12px;line-height:1.45;color:rgba(46,38,34,.45)}
.mg-note.is-flag{padding:10px 12px;border-radius:8px;background:rgba(243,134,55,.1);border:1px solid rgba(243,134,55,.3);color:#8A4A16;font-weight:600}
.mg-table-tight td{padding:7px 10px 7px 0;font-size:12.5px;font-weight:400}
.mg-table-tight td:first-child{font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:500}
.mg-bars{display:flex;flex-direction:column;gap:6px}
.mg-barrow{display:grid;grid-template-columns:112px 1fr 62px;align-items:center;gap:10px;width:100%;padding:9px 10px;border:1px solid rgba(46,38,34,.12);border-radius:9px;background:#fff;font-family:inherit;text-align:left;cursor:pointer;transition:border-color .16s ease}
.mg-barrow:hover{border-color:#F38637}
.mg-barrow-name{font-size:13px;font-weight:600}
.mg-barrow-track{height:7px;border-radius:4px;background:rgba(46,38,34,.08);overflow:hidden}
.mg-barrow-track span{display:block;height:100%;border-radius:4px;min-width:2px}
.mg-barrow-val{text-align:right;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:rgba(46,38,34,.5)}
.mg-dr-empty{padding:22px;border:1px dashed rgba(46,38,34,.18);border-radius:11px}
.mg-dr-empty p{margin:0;font-size:14.5px;line-height:1.5}
.mg-dr-empty-sub{margin-top:10px !important;font-size:12.5px !important;color:rgba(46,38,34,.45)}
.mg-dr-empty code{font-family:'IBM Plex Mono',monospace;font-size:11.5px;background:rgba(46,38,34,.07);padding:2px 5px;border-radius:4px}

.mg-modal-wrap{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(46,38,34,.5);animation:mg-fade .2s ease;font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;color:#2E2622}
.mg-modal{position:relative;width:min(600px,100%);max-height:92vh;overflow-y:auto;padding:32px 34px 28px;border-radius:18px;background:#FAF7F1;border-top:4px solid #F38637;animation:mg-pop .24s cubic-bezier(.2,.7,.3,1)}
.mg-modal-title{margin:0;font-size:27px;font-weight:700;letter-spacing:-.025em}
.mg-modal-sub{margin:9px 0 22px;font-size:14px;line-height:1.5;color:rgba(46,38,34,.55)}
.mg-drop{padding:34px 20px;border:2px dashed rgba(46,38,34,.2);border-radius:14px;background:#fff;text-align:center;cursor:pointer;transition:border-color .16s ease,background .16s ease}
.mg-drop:hover,.mg-drop.is-over{border-color:#F38637;background:rgba(243,134,55,.05)}
.mg-drop-main{margin:0;font-size:15px;font-weight:600}
.mg-drop-sub{margin:6px 0 0;font-size:12.5px;color:rgba(46,38,34,.45)}
.mg-alert{display:flex;flex-direction:column;gap:5px;margin-top:14px;padding:14px 16px;border-radius:11px;font-size:13.5px;line-height:1.45}
.mg-alert.is-good{background:rgba(144,173,81,.14);border:1px solid rgba(144,173,81,.4)}
.mg-alert.is-bad{background:rgba(243,134,55,.13);border:1px solid rgba(243,134,55,.45)}
.mg-alert span{color:rgba(46,38,34,.66);font-size:12.5px}
.mg-alert-warn{color:#B4622A !important;font-weight:600}
.mg-modal-fine{margin:12px 0 0;font-size:12px;line-height:1.5;color:rgba(46,38,34,.45)}
.mg-chsel{display:flex;flex-wrap:wrap;gap:6px}
.mg-chpill{padding:6px 14px;border:1px solid rgba(46,38,34,.16);border-radius:999px;background:#fff;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;color:rgba(46,38,34,.55);cursor:pointer;transition:all .16s ease}
.mg-chpill:hover{border-color:#0598A6;color:#0598A6}
.mg-chpill.is-on{background:#0598A6;border-color:#0598A6;color:#fff}
.mg-assign{display:flex;flex-direction:column;gap:6px;max-height:290px;overflow-y:auto;padding-right:2px}
.mg-assign-row{display:grid;grid-template-columns:1fr 150px;gap:10px;align-items:center;padding:9px 11px;border:1px solid rgba(46,38,34,.12);border-radius:9px;background:#fff}
.mg-assign-name{font-size:13px;font-weight:600;line-height:1.25;word-break:break-word}
.mg-assign-name i{display:block;margin-top:3px;font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.08em;color:rgba(46,38,34,.42)}
.mg-assign-sel{padding:7px 9px;border:1px solid rgba(46,38,34,.18);border-radius:7px;background:#FAF7F1;font-family:'Source Sans 3',sans-serif;font-size:12.5px;color:#2E2622;cursor:pointer}
.mg-assign-sel:focus{outline:2px solid #0598A6;outline-offset:1px}
.mg-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:26px;padding-top:20px;border-top:1px solid rgba(46,38,34,.12)}
.mg-modal.is-narrow{width:min(430px,100%)}
.mg-field{display:block;margin-top:14px}
.mg-field span{display:block;margin-bottom:5px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.45)}
.mg-field span i{font-style:normal;text-transform:none;letter-spacing:0;color:rgba(46,38,34,.3)}
.mg-field input{width:100%;padding:10px 13px;border:1px solid rgba(46,38,34,.18);border-radius:9px;background:#fff;font-family:'Source Sans 3',sans-serif;font-size:14.5px;color:#2E2622}
.mg-field input:focus{outline:none;border-color:#0598A6;box-shadow:0 0 0 3px rgba(5,152,166,.15)}
.mg-status{display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:1420px;margin:-6px auto 20px}
.mg-status-note{font-size:12.5px;color:rgba(46,38,34,.45)}
.mg-status-note.is-warn{color:#8A4A16;font-weight:600}
.mg-btn-sm{padding:6px 15px;font-size:12.5px}
.mg-range{display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:1420px;margin:0 auto 16px;padding:12px 16px;border:1px solid rgba(46,38,34,.12);border-radius:12px;background:#fff}
.mg-range-label{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(46,38,34,.42)}
.mg-range-pills{display:flex;gap:4px;flex-wrap:wrap}
.mg-range-dates{display:flex;align-items:center;gap:7px;margin-left:4px}
.mg-range-dates input{padding:6px 9px;border:1px solid rgba(46,38,34,.16);border-radius:7px;background:#FAF7F1;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:#2E2622;cursor:pointer}
.mg-range-dates input:focus{outline:none;border-color:#0598A6;box-shadow:0 0 0 3px rgba(5,152,166,.15)}
.mg-range-dash{color:rgba(46,38,34,.3)}
.mg-range-note{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.04em;color:rgba(46,38,34,.4)}
@media (max-width:980px){.mg-range-note{margin-left:0;width:100%}}

@keyframes mg-slide{from{transform:translateX(100%)}to{transform:none}}
@keyframes mg-fade{from{opacity:0}to{opacity:1}}
@keyframes mg-pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}

@media (max-width:980px){
  .mg-root{padding:28px 18px 48px}
  .mg-head-right{align-items:flex-start;width:100%}
  .mg-tally{gap:20px}
  .mg-tally-num{font-size:23px}
  .mg-bar-note{margin-left:0;width:100%}
  .mg-drawer{width:100vw;border-left:none;border-top:3px solid #F38637}
  .mg-drawer-inner{padding:26px 20px 44px}
  .mg-modal{padding:26px 20px 22px}
}
@media (max-width:440px){
  .mg-kpis{grid-template-columns:1fr}
  .mg-stack-row{grid-template-columns:1fr;gap:5px}
  .mg-barrow{grid-template-columns:88px 1fr 52px}
  .mg-assign-row{grid-template-columns:1fr;gap:7px}
  .mg-modal-actions{flex-direction:column-reverse}
  .mg-modal-actions .mg-btn{width:100%}
}
@media (prefers-reduced-motion:reduce){.mg-root *,.mg-root *::before,.mg-drawer,.mg-scrim,.mg-modal{animation:none !important;transition:none !important}}

/* ---------- print: only the report sheet ---------- */
.mg-print-sheet{display:none}
@media print{
  @page{size:letter portrait;margin:0.5in}
  html,body{background:#fff !important}
  .mg-root,.mg-drawer,.mg-scrim,.mg-modal-wrap{display:none !important}
  .mg-print-sheet{display:block !important;font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;color:#2E2622;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .mg-print-sheet *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
  .mg-print-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:16px;margin-bottom:26px;border-bottom:3px solid #F38637}
  .mg-print-brand{margin:0 0 6px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#0598A6}
  .mg-print-head h1{margin:0;font-size:30px;font-weight:700;letter-spacing:-.025em;line-height:1.05}
  .mg-print-crumb{margin:6px 0 0;font-size:12.5px;color:rgba(46,38,34,.55)}
  .mg-print-meta{display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(46,38,34,.5);white-space:nowrap}
  .mg-print-sheet .mg-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .mg-print-sheet .mg-kpi{border:1px solid rgba(46,38,34,.18);background:#fff;padding:12px 13px}
  .mg-print-sheet .mg-kpi-value{font-size:21px}
  .mg-print-sheet .mg-dr-h3{margin:26px 0 10px;font-size:10px;letter-spacing:.14em}
  .mg-print-sheet .mg-trend,.mg-print-sheet .mg-barrow,.mg-print-sheet .mg-kpi{break-inside:avoid}
  .mg-print-sheet .mg-trend-bars{height:70px}
  .mg-print-sheet .mg-barrow{border:1px solid rgba(46,38,34,.18);padding:7px 10px}
  .mg-print-sheet .mg-table{font-size:11.5px}
  .mg-print-sheet .mg-table td{padding:8px 10px 8px 0}
  .mg-print-sheet table{break-inside:auto}
  .mg-print-sheet tr{break-inside:avoid}
  .mg-print-foot{margin-top:34px;padding-top:12px;border-top:1px solid rgba(46,38,34,.15);font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:rgba(46,38,34,.4)}
}
`;
