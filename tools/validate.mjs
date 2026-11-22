// Data validator for Defense Aviation Watch.
//   node tools/validate.mjs            validate site/data/*.json, exit 1 on errors
// Also importable in a browser/test page: import { validateAll } from "./validate.mjs".
// Zero dependencies.

export const LINES = ["Military MRO", "Manpower", "Facility management", "Aerial firefighting", "Drones / UAS", "Aerial refueling", "SAR", "Engineering, training and simulation"];
export const SCOPES = ["UAE / GCC", "Global MRO", "Competitors / M&A", "Capability themes"];
export const PRIORITIES = ["high", "med", "watch"];
export const CONFIDENCE = ["Certain", "Likely", "Guessing"];
export const EVIDENCE = ["Primary", "Corroborated", "Single source"];
export const TYPES = ["Contract / award", "Partnership / MoU", "M&A / investment", "Policy / government", "Event", "Technology / capability", "Market / demand", "Operations / supply"];
export const DECISION_STATUS = ["open", "done", "dropped", "blocked"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/;
const isStr = v => typeof v === "string" && v.trim().length > 0;
const validDate = s => DATE.test(s) && !isNaN(new Date(s + "T00:00:00Z"));

export function validateItems(items, E, W) {
  if (!Array.isArray(items)) { E.push("items.json: must be an array"); return; }
  const ids = new Set();
  items.forEach((i, n) => {
    const at = `items[${n}]${i && i.id ? " (" + i.id + ")" : ""}`;
    if (!i || typeof i !== "object") { E.push(`${at}: not an object`); return; }
    if (!isStr(i.id) || !/^[\w-]+$/.test(i.id)) E.push(`${at}: missing or invalid id`);
    else if (ids.has(i.id)) E.push(`${at}: duplicate id`); else ids.add(i.id);
    if (!validDate(i.date || "")) E.push(`${at}: invalid date "${i.date}"`);
    if (!isStr(i.headline)) E.push(`${at}: missing headline`);
    if (!PRIORITIES.includes(i.priority)) E.push(`${at}: priority must be one of ${PRIORITIES}`);
    if (!SCOPES.includes(i.scope)) E.push(`${at}: invalid scope "${i.scope}"`);
    if (!TYPES.includes(i.signal_type)) E.push(`${at}: invalid signal_type "${i.signal_type}"`);
    if (!CONFIDENCE.includes(i.confidence)) E.push(`${at}: invalid confidence "${i.confidence}"`);
    if (!EVIDENCE.includes(i.evidence)) E.push(`${at}: invalid evidence "${i.evidence}"`);
    if (!Array.isArray(i.lines) || i.lines.some(l => !LINES.includes(l))) E.push(`${at}: lines must be a subset of the eight service lines`);
    if (!Array.isArray(i.companies)) E.push(`${at}: companies must be an array`);
    if (!/^https:\/\//.test(i.url || "")) E.push(`${at}: url must start with https://`);
    ["source", "why", "action", "basis"].forEach(k => { if (!isStr(i[k])) E.push(`${at}: missing ${k}`); });
    // Quality rules
    if (i.priority !== "watch" && i.evidence === "Single source") W.push(`${at}: ${i.priority} item rests on a single source`);
    if (i.priority === "high" && i.confidence === "Guessing") W.push(`${at}: high item with Guessing confidence`);
    if (i.added !== undefined && !validDate(i.added)) E.push(`${at}: invalid added date`);
  });
  const dates = items.map(i => i && i.date).filter(Boolean);
  const sorted = [...dates].sort().reverse();
  if (dates.join() !== sorted.join()) W.push("items.json: not sorted by date, newest first");
  if (items.length > 500) E.push("items.json: more than 500 items");
  const live = items.filter(i => i && !i.hold);
  if (live.length >= 20) {
    const watchShare = live.filter(i => i.priority === "watch").length / live.length;
    if (watchShare > 0.9) W.push(`calibration: ${Math.round(watchShare * 100)}% of live items are watch; re-check the med threshold`);
  }
  return ids;
}

export function validateDecisions(dec, itemIds, E, W) {
  if (!Array.isArray(dec)) { E.push("decisions.json: must be an array"); return; }
  const seen = new Set();
  dec.forEach((d, n) => {
    const at = `decisions[${n}]${d && d.id ? " (" + d.id + ")" : ""}`;
    if (!d || typeof d !== "object") { E.push(`${at}: not an object`); return; }
    if (!isStr(d.id)) E.push(`${at}: missing id`); else if (seen.has(d.id)) E.push(`${at}: duplicate id`); else seen.add(d.id);
    if (!isStr(d.topic) || !isStr(d.what)) E.push(`${at}: topic and what are required`);
    if (!DECISION_STATUS.includes(d.status)) E.push(`${at}: invalid status "${d.status}"`);
    if (!validDate(d.due || "")) E.push(`${at}: invalid due date`);
    if (d.status === "open" && !isStr(d.owner)) E.push(`${at}: open decision needs an owner`);
    ["opened", "closed"].forEach(k => { if (d[k] != null && !validDate(d[k])) E.push(`${at}: invalid ${k} date`); });
    if (!Array.isArray(d.items)) E.push(`${at}: items must be an array`);
    else if (itemIds) d.items.forEach(x => { if (!itemIds.has(x)) W.push(`${at}: links unknown item id ${x}`); });
    if ((d.status === "done" || d.status === "dropped") && !d.closed) W.push(`${at}: closed decision has no closed date`);
  });
}

export function validateBrief(b, E, W) {
  if (!b || typeof b !== "object" || Array.isArray(b)) { E.push("brief.json: must be an object"); return; }
  if (!ISO_OFFSET.test(b.refreshed || "")) E.push("brief.refreshed: must be ISO 8601 with a UTC offset");
  if (!isStr(b.summary)) E.push("brief.summary: required");
  if (b.headline !== undefined) {
    if (!isStr(b.headline)) E.push("brief.headline: must be a non-empty string");
    else if (b.headline.trim().split(/\s+/).length > 30) W.push("brief.headline: longer than 30 words; keep the bottom line short");
  } else W.push("brief.headline: missing (bottom line)");
  if (b.changes !== undefined && (!Array.isArray(b.changes) || b.changes.length > 6)) E.push("brief.changes: array of at most 6");
  if (!Array.isArray(b.priorities) || b.priorities.length > 4) E.push("brief.priorities: array of at most 4");
  else b.priorities.forEach((p, n) => ["name", "why", "now", "next"].forEach(k => { if (!isStr(p[k])) E.push(`brief.priorities[${n}]: missing ${k}`); }));
  if (!Array.isArray(b.watch) || b.watch.length > 8) E.push("brief.watch: array of at most 8");
  if (b.refreshed && ISO_OFFSET.test(b.refreshed)) {
    const ageH = (Date.now() - new Date(b.refreshed).getTime()) / 36e5;
    if (ageH > 96) W.push(`brief.refreshed is ${Math.round(ageH / 24)} days old`);
  }
}

export function validateRuns(runs, E) {
  if (!Array.isArray(runs)) { E.push("runs.json: must be an array"); return; }
  if (runs.length > 90) E.push("runs.json: more than 90 entries");
  runs.forEach((r, n) => {
    if (!validDate((r && r.date) || "")) E.push(`runs[${n}]: invalid date`);
    if (!Number.isInteger(r && r.items_added)) E.push(`runs[${n}]: items_added must be an integer`);
  });
}

export function validateWatchlist(wl, E) {
  if (!Array.isArray(wl)) { E.push("watchlist.json: must be an array"); return; }
  const names = new Set();
  wl.forEach((w, n) => {
    if (!isStr(w && w.name)) E.push(`watchlist[${n}]: missing name`);
    else if (names.has(w.name)) E.push(`watchlist[${n}]: duplicate name ${w.name}`); else names.add(w.name);
  });
}

export function validateAll(d) {
  const E = [], W = [];
  const ids = validateItems(d.items, E, W);
  validateDecisions(d.decisions, ids, E, W);
  validateBrief(d.brief, E, W);
  validateRuns(d.runs, E);
  validateWatchlist(d.watchlist, E);
  return { errors: E, warnings: W };
}

// ---- CLI (Node only) ----
const isNode = typeof process !== "undefined" && process.versions && process.versions.node;
if (isNode && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const dir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "site", "data");
  const load = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { console.error(`ERROR ${f}: ${e.message}`); process.exit(1); } };
  const { errors, warnings } = validateAll({ items: load("items.json"), decisions: load("decisions.json"), brief: load("brief.json"), runs: load("runs.json"), watchlist: load("watchlist.json") });
  warnings.forEach(w => console.log("WARN  " + w));
  errors.forEach(e => console.log("ERROR " + e));
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
