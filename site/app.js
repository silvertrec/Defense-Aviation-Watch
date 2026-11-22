(function () {
"use strict";

/* ---------- constants ---------- */
var LINES = ["Military MRO", "Manpower", "Facility management", "Aerial firefighting", "Drones / UAS", "Aerial refueling", "SAR", "Engineering, training and simulation"];
var SCOPES = ["UAE / GCC", "Global MRO", "Competitors / M&A", "Capability themes"];
var PRI = [["high", "High"], ["med", "Medium"], ["watch", "Watch"]];
var RANK = { high: 0, med: 1, watch: 2 };
var TYPES = ["Contract / award", "Partnership / MoU", "M&A / investment", "Policy / government", "Event", "Technology / capability", "Market / demand", "Operations / supply"];
var EVID = ["Primary", "Corroborated", "Single source"];
var EV_CLASS = { "Primary": "ev-p", "Corroborated": "ev-c", "Single source": "ev-s" };
var ARCHIVE_DAYS = 90;
var DEFAULT_F = { q: "", pri: "", scope: "", line: "", co: "", type: "", ev: "", sort: "date", arch: false, fresh: false };

var st = { items: [], watch: [], brief: null, dec: [], runs: [], f: Object.assign({}, DEFAULT_F),
  showAllWatch: false, showClosed: false, prevVisit: null };

/* ---------- helpers ---------- */
var $ = function (i) { return document.getElementById(i); };
function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
var TZ = "Asia/Dubai";
function fmt(d) { try { var x = new Date(d + "T00:00:00+04:00"); if (isNaN(x)) return d || ""; return x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ }); } catch (e) { return d || ""; } }
function fmtD(d) { try { var x = new Date(d + "T00:00:00+04:00"); return x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: TZ }); } catch (e) { return d || ""; } }
function fmtT(d) { try { var x = new Date(d); if (isNaN(x)) return d || "pending"; return x.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }) + " GST"; } catch (e) { return d || "pending"; } }
function today() { return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); }
function dayMs(s) { return new Date(s + "T00:00:00+04:00").getTime(); }
function daysFrom(a, b) { return Math.round((dayMs(b) - dayMs(a)) / 864e5); } // b - a
function addDays(s, n) { var d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekStart(s) { var d = new Date(s + "T00:00:00Z"), dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }
function safeUrl(u) { return typeof u === "string" && /^https?:\/\//.test(u); }
function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function live(i) { return !i.hold; }
function future(i) { return (i.date || "") >= today(); }
function disputed(i) { return i.disputed === true || /disputed|sources differ/i.test((i.source || "") + " " + (i.why || "") + " " + (i.basis || "")); }
function archived(i) { return i.priority === "watch" && !future(i) && daysFrom(i.date, today()) > ARCHIVE_DAYS; }
function mentions(i, name) {
  var n = name.toLowerCase();
  if ((i.companies || []).some(function (c) { return String(c).toLowerCase() === n; })) return true;
  return new RegExp("\\b" + esc(name) + "\\b", "i").test(i.headline || "");
}
// "New" = added since your previous visit. Items without an `added` date fall back to their publication date,
// but a future-dated event is never "new" by date alone.
function isNew(i) { var k = i.added || (future(i) ? "" : i.date || ""); return !!st.prevVisit && k > st.prevVisit; }
function sentence1(t) { var m = /^.*?[.!?](\s|$)/.exec(t || ""); return m ? m[0].trim() : (t || ""); }
// Bottom line: use brief.headline; if absent, lead with the summary's first sentence and show only the remainder below it.
function headParts(b) {
  var head = b.headline || sentence1(b.summary), rest = b.summary || "";
  if (!b.headline && rest.indexOf(head) === 0) rest = rest.slice(head.length).trim();
  return { head: head, rest: rest === head ? "" : rest };
}
function msg(t) { var m = $("toolMsg"); m.textContent = t; clearTimeout(msg._t); msg._t = setTimeout(function () { m.textContent = ""; }, 3500); }
function download(name, mime, text, bom) {
  var b = new Blob([bom ? "\ufeff" : "", text], { type: mime }), a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- data-link lamp ---------- */
function nextRun(ref) {
  var d = new Date(ref.getTime() + 4 * 3600e3), y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  for (var k = 0; k < 9; k++) { var t = Date.UTC(y, m, day + k, 2, 59), wd = new Date(t).getUTCDay(); if (t > ref.getTime() && wd >= 1 && wd <= 5) return t; }
  return null;
}
function linkState() {
  var b = st.brief; if (!b || !b.refreshed) return { cls: "", label: "awaiting" };
  var r = new Date(b.refreshed); if (isNaN(r)) return { cls: "", label: "unknown" };
  var nr = nextRun(r), now = Date.now(), cls = "ok", label = "nominal";
  if (nr !== null) { if (now > nr + 27 * 3600e3) { cls = "bad"; label = "stale"; } else if (now > nr + 3 * 3600e3) { cls = "warn"; label = "delayed"; } }
  return { cls: cls, label: label };
}
function renderLink() { var s = linkState(); $("link").className = "link " + s.cls; $("linkS").textContent = s.label; }

/* ---------- filters: state <-> UI <-> URL ---------- */
function readHash() {
  var p = new URLSearchParams(location.hash.replace(/^#/, ""));
  Object.keys(DEFAULT_F).forEach(function (k) {
    if (!p.has(k)) return; var v = p.get(k);
    st.f[k] = typeof DEFAULT_F[k] === "boolean" ? v === "1" : v;
  });
}
function writeHash() {
  var p = new URLSearchParams();
  Object.keys(DEFAULT_F).forEach(function (k) {
    var v = st.f[k]; if (v === DEFAULT_F[k]) return; p.set(k, typeof v === "boolean" ? "1" : v);
  });
  var s = p.toString();
  try { history.replaceState(null, "", s ? "#" + s : location.pathname + location.search); } catch (e) {}
}
var chipSets = {};
function chips(host, list, key) {
  var btns = [];
  function add(v, l) {
    var b = el("button", "chip", l); b.type = "button"; b.dataset.v = v; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", function () { st.f[key] = v; syncUI(); renderFeed(); }); host.appendChild(b); btns.push(b);
  }
  add("", "All");
  list.forEach(function (p) { add(Array.isArray(p) ? p[0] : p, Array.isArray(p) ? p[1] : p); });
  chipSets[key] = btns;
}
function fillSelect(id, list) { var s = $(id); list.forEach(function (v) { var o = el("option", null, v); o.value = v; s.appendChild(o); }); }
function syncUI() {
  Object.keys(chipSets).forEach(function (k) { chipSets[k].forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === st.f[k] ? "true" : "false"); }); });
  $("fq").value = st.f.q; $("fline").value = st.f.line; $("fco").value = st.f.co; $("ftype").value = st.f.type; $("fev").value = st.f.ev; $("fsort").value = st.f.sort;
  $("fnew").checked = st.f.fresh; $("farch").checked = st.f.arch;
  // a value that no longer exists in a select falls back to "All"
  ["fline:line", "fco:co", "ftype:type", "fev:ev"].forEach(function (p) { var a = p.split(":"), s = $(a[0]); if (s.value !== st.f[a[1]]) st.f[a[1]] = s.value; });
  writeHash();
}
function bindControls() {
  chips($("fpri"), PRI, "pri"); chips($("fscope"), SCOPES, "scope");
  fillSelect("fline", LINES); fillSelect("ftype", TYPES); fillSelect("fev", EVID);
  var qt; $("fq").addEventListener("input", function () { clearTimeout(qt); var v = this.value; qt = setTimeout(function () { st.f.q = v; writeHash(); renderFeed(); }, 150); });
  [["fline", "line"], ["fco", "co"], ["ftype", "type"], ["fev", "ev"], ["fsort", "sort"]].forEach(function (p) {
    $(p[0]).addEventListener("change", function () { st.f[p[1]] = this.value; writeHash(); renderFeed(); });
  });
  $("fnew").addEventListener("change", function () { st.f.fresh = this.checked; writeHash(); renderFeed(); });
  $("farch").addEventListener("change", function () { st.f.arch = this.checked; writeHash(); renderFeed(); });
  $("freset").addEventListener("click", function () { st.f = Object.assign({}, DEFAULT_F); syncUI(); renderFeed(); });
  $("decToggle").addEventListener("click", function () { st.showClosed = !st.showClosed; renderDecisions(); });
  $("bPrint").addEventListener("click", function () { window.print(); });
  $("bCopy").addEventListener("click", copyBrief);
  $("bCsv").addEventListener("click", exportCsv);
  $("icsAll").addEventListener("click", function () { var r = upcoming(); if (!r.length) { msg("No upcoming events to export."); return; } download("defense-aviation-watch-events.ics", "text/calendar", buildIcs(r)); });
  window.addEventListener("beforeprint", function () { document.body.classList.add("pb"); });
  window.addEventListener("afterprint", function () { document.body.classList.remove("pb"); });
  window.addEventListener("hashchange", function () { st.f = Object.assign({}, DEFAULT_F); readHash(); syncUI(); renderFeed(); });
}

/* ---------- decisions ---------- */
function decisions() {
  if (st.dec && st.dec.length) return st.dec;
  var b = st.brief; // fallback for older data: decisions inside the brief
  return ((b && b.decisions) || []).filter(function (d) { return d && d.what; }).map(function (d, n) {
    return { id: "brief-" + n, topic: d.topic || "", what: d.what, owner: d.lead || "", due: d.by || "", status: "open", note: "", items: [] };
  });
}
function decState(d) {
  if (d.status === "done" || d.status === "dropped") return { cls: "done", label: d.status === "done" ? "Done" : "Dropped", od: false, rank: 3 };
  var left = d.due ? daysFrom(today(), d.due) : null;
  if (d.status === "blocked") return { cls: "blk", label: "Blocked", od: left !== null && left < 0, rank: 2, left: left };
  if (left === null) return { cls: "open", label: "Open", od: false, rank: 1 };
  if (left < 0) return { cls: "od", label: "Overdue " + (-left) + (left === -1 ? " day" : " days"), od: true, rank: 0, left: left };
  if (left === 0) return { cls: "soon", label: "Due today", od: false, rank: 1, left: left };
  return { cls: left <= 7 ? "soon" : "open", label: "Due in " + left + (left === 1 ? " day" : " days"), od: false, rank: 1, left: left };
}
function renderDecisions() {
  var h = $("dec"); h.textContent = "";
  var all = decisions(), rows = all.slice();
  var closed = rows.filter(function (d) { return decState(d).rank === 3; }).length;
  $("decToggle").textContent = st.showClosed ? "Hide closed" : "Show closed" + (closed ? " (" + closed + ")" : "");
  $("decToggle").setAttribute("aria-pressed", st.showClosed ? "true" : "false");
  $("decToggle").hidden = closed === 0;
  if (!st.showClosed) rows = rows.filter(function (d) { return decState(d).rank !== 3; });
  if (!rows.length) { h.appendChild(el("div", "muted", all.length ? "No open decisions." : "No decisions recorded.")); return; }
  rows.sort(function (a, b) { var x = decState(a), y = decState(b); return x.rank - y.rank || (a.due || "").localeCompare(b.due || ""); });
  var g = el("div", "dec");
  rows.forEach(function (d) {
    var s = decState(d), c = el("div", "d " + s.cls);
    var top = el("div", "dtop"); if (d.topic) top.appendChild(el("span", "lbl", d.topic)); top.appendChild(el("span", "stat " + s.cls, s.label)); c.appendChild(top);
    c.appendChild(el("div", "what", d.what));
    var kv = el("div", "kv");
    if (d.owner) { var a = el("span"); a.appendChild(document.createTextNode("Owner ")); a.appendChild(el("b", null, d.owner)); kv.appendChild(a); }
    if (d.due) { var z = el("span"); z.appendChild(document.createTextNode("Due ")); z.appendChild(el("b", null, fmt(d.due))); kv.appendChild(z); }
    if (kv.childNodes.length) c.appendChild(kv);
    if (d.note) c.appendChild(el("div", "dnote", d.note));
    var ev = (d.items || []).map(function (id) { return st.items.filter(function (i) { return i.id === id; })[0]; }).filter(Boolean);
    if (ev.length) {
      var u = el("ul", "dev"); ev.slice(0, 3).forEach(function (i) {
        var li = el("li"); if (safeUrl(i.url)) { var a2 = el("a", null, i.headline); a2.href = i.url; a2.target = "_blank"; a2.rel = "noopener"; li.appendChild(a2); } else li.textContent = i.headline; u.appendChild(li);
      });
      var lab = el("span", "lbl", "Evidence"); c.appendChild(lab); c.appendChild(u);
    }
    g.appendChild(c);
  });
  h.appendChild(g);
}

/* ---------- bottom line, tiles, priorities ---------- */
function renderBluf() {
  var b = st.brief, h = $("bluf"); h.textContent = "";
  if (!b) { h.appendChild(el("div", "empty", "Awaiting first refresh.")); return; }
  $("bstamp").textContent = "Refreshed " + fmtT(b.refreshed);
  var hp = headParts(b), head = hp.head, rest = hp.rest;
  if (head) h.appendChild(el("p", "bl", head));
  if (rest && rest !== head) h.appendChild(el("p", "sum", rest));
  if (b.changes && b.changes.length) {
    var s = el("div", "sub-h"); s.appendChild(el("h2", null, "What changed since the last brief")); h.appendChild(s);
    var u = el("ul", "watchlist"); b.changes.forEach(function (x) { u.appendChild(el("li", null, x)); }); h.appendChild(u);
  }
}
function renderTiles() {
  var h = $("sit"); h.textContent = "";
  var rows = st.items.filter(live), t = today(), t0 = dayMs(t), c = { high: 0, med: 0, watch: 0 }, wk = 0;
  rows.forEach(function (i) { if (c[i.priority] != null) c[i.priority]++; if (!future(i)) { var ago = (t0 - dayMs(i.date)) / 864e5; if (ago >= 0 && ago <= 7) wk++; } });
  var dec = decisions().filter(function (d) { return decState(d).rank !== 3; }), od = dec.filter(function (d) { return decState(d).od; }).length;
  [["High priority", c.high, "hi", ""], ["Medium priority", c.med, "med", ""], ["Watch", c.watch, "watch", ""], ["New, last 7 days", wk, "", ""],
   ["Open decisions", dec.length, od ? "hi" : "", od ? od + " overdue" : ""]].forEach(function (x) {
    var d = el("div", "tile " + x[2]); d.appendChild(el("span", "n", String(x[1]))); d.appendChild(el("span", "lbl", x[0]));
    if (x[3]) d.appendChild(el("span", "od", x[3])); h.appendChild(d);
  });
}
function renderPriorities() {
  var b = st.brief, h = $("prio"); h.textContent = "";
  if (!b || ((!b.priorities || !b.priorities.length) && (!b.watch || !b.watch.length))) { h.appendChild(el("div", "muted", "No standing priorities.")); return; }
  if (b.priorities && b.priorities.length) {
    var pr = el("div", "pr");
    b.priorities.forEach(function (p) {
      var c = el("div", "p"); c.appendChild(el("div", "nm", p.name || ""));
      if (p.confidence) c.appendChild(el("span", "conf", "Confidence: " + p.confidence));
      c.appendChild(el("div", "why", p.why || ""));
      var d = el("dl");
      [["0 to 2 weeks", p.now], ["30 to 60 days", p.next], ["Trigger to watch", p.trigger]].forEach(function (q) { if (q[1]) { d.appendChild(el("dt", null, q[0])); d.appendChild(el("dd", null, q[1])); } });
      c.appendChild(d); pr.appendChild(c);
    });
    h.appendChild(pr);
  }
  if (b.watch && b.watch.length) {
    var s = el("div", "sub-h"); s.appendChild(el("h2", null, "Watch next week")); h.appendChild(s);
    var u = el("ul", "watchlist"), lim = st.showAllWatch ? b.watch.length : Math.min(5, b.watch.length);
    b.watch.slice(0, lim).forEach(function (x) { u.appendChild(el("li", null, x)); }); h.appendChild(u);
    if (b.watch.length > 5) { var m = el("button", "more", st.showAllWatch ? "Show top 5 only" : "Show all " + b.watch.length); m.type = "button"; m.addEventListener("click", function () { st.showAllWatch = !st.showAllWatch; renderPriorities(); }); h.appendChild(m); }
  }
}

/* ---------- activity, events ---------- */
function jumpToFeed() { var f = $("feed"); if (f.scrollIntoView) f.scrollIntoView({ behavior: "smooth", block: "start" }); }
function renderActivity() {
  var h = $("act"); h.textContent = "";
  var t0 = dayMs(today()), cnt = {}; LINES.forEach(function (l) { cnt[l] = [0, 0]; });
  st.items.filter(live).forEach(function (i) {
    if (future(i)) return; var ago = (t0 - dayMs(i.date)) / 864e5;
    (i.lines || []).forEach(function (l) { if (!cnt[l]) return; if (ago <= 30) cnt[l][0]++; else if (ago <= 90) cnt[l][1]++; });
  });
  var max = 1; LINES.forEach(function (l) { max = Math.max(max, cnt[l][0] + cnt[l][1]); });
  LINES.forEach(function (l) {
    var b = el("button", "row"); b.type = "button"; b.setAttribute("aria-label", l + ": " + cnt[l][0] + " in last 30 days, " + cnt[l][1] + " from 31 to 90 days");
    b.appendChild(el("span", "lab", l));
    var tr = el("span", "trk"), a = el("span", "seg30"), c = el("span", "seg90");
    a.style.width = (cnt[l][0] / max * 100) + "%"; c.style.width = (cnt[l][1] / max * 100) + "%"; tr.appendChild(a); tr.appendChild(c); b.appendChild(tr);
    b.appendChild(el("span", "cnt", cnt[l][0] + " / " + cnt[l][1]));
    b.addEventListener("click", function () { st.f.line = l; syncUI(); renderFeed(); jumpToFeed(); });
    h.appendChild(b);
  });
}
function upcoming() { return st.items.filter(function (i) { return live(i) && future(i); }).sort(function (a, b) { return a.date.localeCompare(b.date); }); }
function icsText(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function fold(line) { var out = [], s = line; while (s.length > 72) { out.push(s.slice(0, 72)); s = " " + s.slice(72); } out.push(s); return out.join("\r\n"); }
function buildIcs(rows) {
  var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Defense Aviation Watch//EN", "CALSCALE:GREGORIAN"];
  rows.forEach(function (i) {
    L.push("BEGIN:VEVENT", "UID:" + (i.id || i.date) + "@defense-aviation-watch", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;VALUE=DATE:" + i.date.replace(/-/g, ""), "DTEND;VALUE=DATE:" + addDays(i.date, 1).replace(/-/g, ""),
      fold("SUMMARY:" + icsText(i.headline)), fold("DESCRIPTION:" + icsText((i.action ? "Action: " + i.action + "\n" : "") + (i.why || ""))));
    if (safeUrl(i.url)) L.push(fold("URL:" + i.url));
    L.push("END:VEVENT");
  });
  L.push("END:VCALENDAR"); return L.join("\r\n") + "\r\n";
}
function renderEvents() {
  var h = $("ev"); h.textContent = ""; var rows = upcoming();
  $("icsAll").hidden = !rows.length;
  if (!rows.length) { h.appendChild(el("div", "muted", "No dated events yet.")); return; }
  rows.forEach(function (i) {
    var e = el("div", "e"); e.appendChild(el("div", "dt", fmt(i.date)));
    var r = el("div"), t = el("div", "t");
    if (safeUrl(i.url)) { var a = el("a", null, i.headline || ""); a.href = i.url; a.target = "_blank"; a.rel = "noopener"; a.style.color = "inherit"; t.appendChild(a); } else t.textContent = i.headline || "";
    r.appendChild(t); if (i.action) r.appendChild(el("div", "a", i.action));
    var ib = el("button", "linkbtn", "Add to calendar"); ib.type = "button"; ib.addEventListener("click", function () { download("event-" + i.date + ".ics", "text/calendar", buildIcs([i])); });
    r.appendChild(ib); e.appendChild(r); h.appendChild(e);
  });
}

/* ---------- competitor and partner watch ---------- */
function renderCompanies() {
  var h = $("co"); h.textContent = "";
  if (!st.watch.length) { h.appendChild(el("div", "muted", "No watchlist configured.")); return; }
  var t0 = dayMs(today()), rows = st.watch.filter(function (w) { return w.name; }).map(function (w) {
    var its = st.items.filter(function (i) { return live(i) && mentions(i, w.name); });
    var past = its.filter(function (i) { return !future(i); }), c30 = past.filter(function (i) { return (t0 - dayMs(i.date)) / 864e5 <= 30; }).length;
    var top = its.reduce(function (m, i) { return Math.min(m, RANK[i.priority] != null ? RANK[i.priority] : 2); }, 3);
    var latest = past.map(function (i) { return i.date; }).sort().reverse()[0] || "";
    return { w: w, c30: c30, total: its.length, top: top, latest: latest };
  });
  rows.sort(function (a, b) { return (a.c30 ? 0 : 1) - (b.c30 ? 0 : 1) || a.top - b.top || b.c30 - a.c30 || a.w.name.localeCompare(b.w.name); });
  rows.forEach(function (r) {
    var b = el("button", "corow"); b.type = "button";
    b.setAttribute("aria-label", r.w.name + ": " + r.c30 + " signals in the last 30 days");
    var nm = el("span", "conm"), tt = el("span", "ctype", r.w.type || "");
    if (/^Proposed:/.test(r.w.note || "")) tt.appendChild(el("span", "ptag", "Trial"));
    nm.appendChild(el("b", null, r.w.name)); nm.appendChild(tt); b.appendChild(nm);
    var dot = el("i", "pdot " + (["hi", "med", "watch"][r.top] || "none")); b.appendChild(dot);
    b.appendChild(el("span", "cc", r.c30 ? r.c30 + " in 30d" : "quiet"));
    b.appendChild(el("span", "cl", r.latest ? "Latest " + fmtD(r.latest) : "No signal"));
    b.addEventListener("click", function () { st.f.co = r.w.name; syncUI(); renderFeed(); jumpToFeed(); });
    h.appendChild(b);
  });
}

/* ---------- weekly trend ---------- */
function renderTrend() {
  var h = $("trend"); h.textContent = "";
  var w0 = weekStart(today()), weeks = []; for (var k = 7; k >= 0; k--) weeks.push(addDays(w0, -7 * k));
  var data = {}; weeks.forEach(function (w) { data[w] = { high: 0, med: 0, watch: 0 }; });
  st.items.filter(function (i) { return live(i) && !future(i); }).forEach(function (i) { var w = weekStart(i.date); if (data[w] && data[w][i.priority] != null) data[w][i.priority]++; });
  var max = 1; weeks.forEach(function (w) { max = Math.max(max, data[w].high + data[w].med + data[w].watch); });
  var H = 110, total = 0;
  weeks.forEach(function (w, n) {
    var d = data[w], sum = d.high + d.med + d.watch; total += sum;
    var col = el("div", "tcol"); col.setAttribute("role", "img");
    col.setAttribute("aria-label", "Week of " + fmtD(w) + ": " + d.high + " high, " + d.med + " medium, " + d.watch + " watch");
    col.appendChild(el("span", "tn", sum ? String(sum) : ""));
    var bar = el("div", "tbar"); bar.style.height = H + "px";
    ["high", "med", "watch"].forEach(function (p) { if (!d[p]) return; var s = el("span", "ts " + p); s.style.height = (d[p] / max * H) + "px"; bar.appendChild(s); });
    col.appendChild(bar); col.appendChild(el("span", "tl", n === weeks.length - 1 ? "This wk" : fmtD(w))); h.appendChild(col);
  });
  var a = weeks.slice(0, 4).reduce(function (s, w) { return s + data[w].high + data[w].med + data[w].watch; }, 0), b = weeks.slice(4).reduce(function (s, w) { return s + data[w].high + data[w].med + data[w].watch; }, 0);
  $("trendNote").textContent = total + " signals in 8 weeks. Last 4 weeks: " + b + ". Previous 4 weeks: " + a + ".";
}

/* ---------- evidence and coverage ---------- */
function renderQuality() {
  var h = $("qual"); h.textContent = "";
  var rows = st.items.filter(live), n = rows.length || 1, g = el("div", "qgrid");
  function stat(label, value, sub, cls) { var d = el("div", "qs " + (cls || "")); d.appendChild(el("span", "lbl", label)); d.appendChild(el("span", "qv", value)); if (sub) d.appendChild(el("span", "qsub", sub)); g.appendChild(d); }
  var mix = {}; EVID.forEach(function (e) { mix[e] = rows.filter(function (i) { return i.evidence === e; }).length; });
  var strong = Math.round((mix.Primary + mix.Corroborated) / n * 100);
  stat("Primary or corroborated", strong + "%", mix.Primary + " primary, " + mix.Corroborated + " corroborated, " + mix["Single source"] + " single source", strong < 50 ? "warn" : "");
  var hi = rows.filter(function (i) { return i.priority !== "watch"; }), weak = hi.filter(function (i) { return i.evidence === "Single source"; }).length;
  stat("High and medium on one source", String(weak), hi.length ? "of " + hi.length + " high or medium items" : "no high or medium items", weak ? "warn" : "");
  var watchShare = Math.round(rows.filter(function (i) { return i.priority === "watch"; }).length / n * 100);
  stat("Rated Watch", watchShare + "%", watchShare > 90 ? "Very high: ratings may be too cautious" : "of live items", watchShare > 90 ? "warn" : "");
  var r = st.runs[0], age = r ? daysFrom(r.date, today()) : null;
  stat("Last refresh run", r ? fmt(r.date) : "No run log", r ? (age === 0 ? "today" : age + (age === 1 ? " day ago" : " days ago")) + ", " + r.items_added + " added" : "", age !== null && age > 4 ? "warn" : "");
  var depthLow = r && r.queries !== undefined && r.queries < 30;
  stat("Search depth, last run", r && r.queries !== undefined ? r.queries + " queries" : "Not recorded",
    r && r.queries !== undefined ? (r.primary_documents_read !== undefined ? r.primary_documents_read + " primary documents read" : "primary documents not recorded") + (depthLow ? ". Below the 30-query minimum" : "") : "Older runs did not log this", depthLow ? "warn" : "");
  var last10 = st.runs.slice(0, 10), sum10 = last10.reduce(function (s, x) { return s + (x.items_added || 0); }, 0);
  stat("Items added, last 10 runs", last10.length ? String(sum10) : "n/a", last10.length ? "over " + last10.length + " runs" : "");
  var bd = (r && r.blocked_domains) || [];
  stat("Sources not reachable", bd.length ? String(bd.length) : (r && r.queries ? "0" : "Unknown"), bd.length ? bd.slice(0, 3).join(", ") : (r && r.queries ? "all sources reachable" : "Not recorded before the upgrade"), bd.length ? "warn" : "");
  h.appendChild(g);
  var bar = el("div", "emix"); bar.setAttribute("role", "img"); bar.setAttribute("aria-label", "Evidence mix: " + mix.Primary + " primary, " + mix.Corroborated + " corroborated, " + mix["Single source"] + " single source");
  [["Primary", "ev-p"], ["Corroborated", "ev-c"], ["Single source", "ev-s"]].forEach(function (x) { var s = el("span", "seg " + x[1]); s.style.width = (mix[x[0]] / n * 100) + "%"; bar.appendChild(s); });
  h.appendChild(bar);
  var lg = el("div", "legend"); [["Primary", "ev-p"], ["Corroborated", "ev-c"], ["Single source", "ev-s"]].forEach(function (x) { var s = el("span"); s.appendChild(el("i", "sw " + x[1])); s.appendChild(document.createTextNode(x[0])); lg.appendChild(s); }); h.appendChild(lg);
}

/* ---------- feed ---------- */
function visible(i) {
  var f = st.f;
  if (!live(i)) return false;
  if (f.pri && i.priority !== f.pri) return false;
  if (f.scope && i.scope !== f.scope) return false;
  if (f.line && (i.lines || []).indexOf(f.line) < 0) return false;
  if (f.co && !mentions(i, f.co)) return false;
  if (f.type && i.signal_type !== f.type) return false;
  if (f.ev && i.evidence !== f.ev) return false;
  if (f.fresh && !isNew(i)) return false;
  if (!f.arch && archived(i)) return false;
  if (f.q) {
    var hay = [i.headline, i.why, i.action, i.source, i.signal_type, (i.companies || []).join(" "), (i.lines || []).join(" ")].join(" ").toLowerCase();
    var ok = f.q.toLowerCase().split(/\s+/).filter(Boolean).every(function (t) { return hay.indexOf(t) >= 0; });
    if (!ok) return false;
  }
  return true;
}
function sorted(rows) {
  var r = rows.slice();
  if (st.f.sort === "pri") r.sort(function (a, b) { return (RANK[a.priority] - RANK[b.priority]) || (b.date || "").localeCompare(a.date || ""); });
  else r.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
  return r;
}
function card(i) {
  var a = el("article", i.priority || "watch"), m = el("div", "meta");
  var code = { high: "P1", med: "P2", watch: "P3" }[i.priority] || "P3", pl = (PRI.filter(function (p) { return p[0] === i.priority; })[0] || ["", "Watch"])[1];
  var pc = el("div", "pc"); pc.appendChild(el("b", null, code)); pc.appendChild(el("span", null, pl)); a.appendChild(pc);
  var bd = el("div", "tbody");
  m.appendChild(el("span", null, fmt(i.date))); m.appendChild(el("span", null, i.scope || ""));
  if (i.confidence) m.appendChild(el("span", null, "Confidence: " + i.confidence));
  if (isNew(i)) m.appendChild(el("span", "newb", "New"));
  bd.appendChild(m);
  var h = el("h3");
  if (safeUrl(i.url)) { var l = el("a", null, i.headline || ""); l.href = i.url; l.target = "_blank"; l.rel = "noopener"; h.appendChild(l); } else h.textContent = i.headline || "";
  bd.appendChild(h);
  if (i.source) bd.appendChild(el("div", "meta src", i.source));
  var tg = el("div", "tags");
  if (i.evidence) tg.appendChild(el("span", "tag evb " + (EV_CLASS[i.evidence] || ""), i.evidence));
  if (disputed(i)) tg.appendChild(el("span", "tag dis", "Check sources"));
  if (i.signal_type) tg.appendChild(el("span", "tag typ", i.signal_type));
  (i.companies || []).forEach(function (x) { tg.appendChild(el("span", "tag co", x)); });
  (i.lines || []).forEach(function (x) { tg.appendChild(el("span", "tag", x)); }); bd.appendChild(tg);
  var d = el("dl");
  [["Why it matters", i.why], ["Suggested action", i.action], ["Rating basis", i.basis]].forEach(function (p) { if (p[1]) { d.appendChild(el("dt", null, p[0])); d.appendChild(el("dd", null, p[1])); } });
  bd.appendChild(d); a.appendChild(bd); return a;
}
function currentRows() { return sorted(st.items.filter(visible)); }
function renderFeed() {
  var f = $("feed"); f.textContent = "";
  var all = st.items.filter(live), rows = currentRows(), hidden = all.filter(function (i) { return archived(i); }).length;
  $("count").textContent = rows.length + " of " + all.length + " items" + (!st.f.arch && hidden ? " (" + hidden + " archived hidden)" : "");
  if (!rows.length) { f.appendChild(el("div", "empty", all.length ? "No items match these filters." : "No items yet. The agent adds items on each refresh.")); return; }
  rows.forEach(function (i) { f.appendChild(card(i)); });
}
function fillCompanies() {
  var names = {}; st.watch.forEach(function (w) { if (w.name) names[w.name] = 1; });
  st.items.forEach(function (i) { (i.companies || []).forEach(function (c) { names[c] = 1; }); });
  var sel = $("fco"), cur = st.f.co; sel.textContent = ""; var o = el("option", null, "All"); o.value = ""; sel.appendChild(o);
  Object.keys(names).sort().forEach(function (n) { var x = el("option", null, n); x.value = n; sel.appendChild(x); });
  sel.value = names[cur] ? cur : ""; st.f.co = sel.value;
}

/* ---------- export, copy ---------- */
function csvCell(v) {
  var s = Array.isArray(v) ? v.join("; ") : String(v == null ? "" : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula guard
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportCsv() {
  var rows = currentRows(); if (!rows.length) { msg("Nothing to export with these filters."); return; }
  var cols = ["date", "priority", "scope", "signal_type", "evidence", "confidence", "headline", "companies", "lines", "why", "action", "source", "url"];
  var out = [cols.join(",")].concat(rows.map(function (i) { return cols.map(function (c) { return csvCell(i[c]); }).join(","); }));
  download("defense-aviation-watch-" + today() + ".csv", "text/csv;charset=utf-8", out.join("\r\n") + "\r\n", true);
  msg("Exported " + rows.length + " items.");
}
function briefText() {
  var b = st.brief || {}, L = ["DEFENSE AVIATION WATCH", b.refreshed ? "Refreshed " + fmtT(b.refreshed) : "", ""];
  var hp = headParts(b); if (hp.head) L.push("BOTTOM LINE", hp.head, "");
  if (hp.rest) L.push(hp.rest, "");
  if (b.changes && b.changes.length) { L.push("WHAT CHANGED"); b.changes.forEach(function (x) { L.push("- " + x); }); L.push(""); }
  var dec = decisions().filter(function (d) { return decState(d).rank !== 3; });
  if (dec.length) { L.push("DECISIONS"); dec.forEach(function (d) { L.push("- " + (d.topic ? d.topic + ": " : "") + d.what + " [" + (d.owner || "no owner") + ", due " + (d.due ? fmt(d.due) : "n/a") + ", " + decState(d).label.toLowerCase() + "]"); }); L.push(""); }
  var top = sorted(st.items.filter(function (i) { return live(i) && i.priority !== "watch" && !archived(i); })).slice(0, 8);
  if (top.length) { L.push("TOP SIGNALS"); top.forEach(function (i) { L.push("- [" + (i.priority === "high" ? "High" : "Medium") + ", " + (i.evidence || "n/a") + "] " + fmt(i.date) + ": " + i.headline + (safeUrl(i.url) ? " " + i.url : "")); }); L.push(""); }
  if (b.watch && b.watch.length) { L.push("WATCH NEXT WEEK"); b.watch.forEach(function (x) { L.push("- " + x); }); L.push(""); }
  L.push("Public-source intelligence compiled by an AI agent. Verify before external use.");
  return L.join("\n");
}
function copyBrief() {
  var t = briefText();
  function fallback() { var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); msg(ok ? "Brief copied." : "Copy failed. Use Print instead."); }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { msg("Brief copied."); }, fallback); else fallback();
}

/* ---------- load ---------- */
function load(name) { return fetch("data/" + name + ".json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(name); return r.json(); }); }
function optional(name, fb) { return load(name).catch(function () { return fb; }); }
function renderAll() {
  renderLink(); renderBluf(); renderTiles(); renderDecisions(); renderPriorities(); renderActivity(); renderEvents();
  renderCompanies(); renderTrend(); renderQuality(); fillCompanies(); syncUI(); renderFeed();
}
function refresh() {
  return Promise.all([load("brief"), load("items"), optional("watchlist", []), optional("decisions", []), optional("runs", [])]).then(function (r) {
    st.brief = r[0]; st.items = r[1]; st.watch = r[2]; st.dec = r[3]; st.runs = r[4];
    renderAll();
  }).catch(function () {
    if (!st.items.length) { var f = $("feed"); f.textContent = ""; f.appendChild(el("div", "empty", "Could not load data. Check your connection and reload.")); }
    $("linkS").textContent = "offline"; $("link").className = "link bad";
  });
}
function visitInit() {
  try {
    var prev = localStorage.getItem("daw.lastVisit"), now = new Date().toISOString();
    st.prevVisit = prev ? new Date(prev).toLocaleDateString("en-CA", { timeZone: TZ }) : null;
    if (!prev || Date.now() - new Date(prev).getTime() > 6 * 3600e3) localStorage.setItem("daw.lastVisit", now);
  } catch (e) { st.prevVisit = null; }
}

visitInit(); readHash(); bindControls(); setInterval(renderLink, 60000); setInterval(refresh, 15 * 60000);
document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
refresh();
if ("serviceWorker" in navigator) { window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); }); }
})();
