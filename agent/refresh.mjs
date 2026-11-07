#!/usr/bin/env node
// Defense Aviation Watch - refresh agent.
// Runs outside Claude Code: calls the Anthropic Messages API with the server-side web_search tool,
// merges new items into site/data/items.json and rewrites site/data/brief.json.
// Zero dependencies. Requires Node 18+ and ANTHROPIC_API_KEY.
//
//   node agent/refresh.mjs            # real run
//   node agent/refresh.mjs --dry      # print what would change, write nothing

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "site", "data");
const DRY = process.argv.includes("--dry");
const MODEL = process.env.AGENT_MODEL || "claude-sonnet-5-5";
const KEY = process.env.ANTHROPIC_API_KEY;
const MAX_ITEMS_KEPT = 500;

const LINES = ["Military MRO", "Manpower", "Facility management", "Aerial firefighting", "Drones / UAS", "Aerial refueling", "SAR", "Engineering, training and simulation"];
const SCOPES = ["UAE / GCC", "Global MRO", "Competitors / M&A", "Capability themes"];

const readJson = async (f, d) => { try { return JSON.parse(await readFile(path.join(DATA, f), "utf8")); } catch { return d; } };
const writeJson = (f, v) => writeFile(path.join(DATA, f), JSON.stringify(v, null, 2) + "\n", "utf8");

// Gulf Standard Time timestamp, e.g. 2026-11-06T07:00:42+04:00
function gst(d = new Date()) {
  const t = new Date(d.getTime() + 4 * 3600e3).toISOString().slice(0, 19);
  return t + "+04:00";
}
const todayGst = () => gst().slice(0, 10);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const SYSTEM = `You are Defense Aviation Watch, a daily news analyst and strategic advisor for the commercial strategy team at Global Aerospace Logistics (GAL), a UAE-based aviation services company.

GAL's eight service lines: ${LINES.join("; ")}.
Item scopes: ${SCOPES.join("; ")}.
Geographic focus: UAE and GCC first, then global MRO, competitor and M&A moves, and capability themes that change GAL's market.

Your job each run: search the web for developments from the last 7 days (and any newly announced future events), judge relevance to GAL, and return ONLY structured JSON.

Rating rubric (be strict, most items are Watch):
- high: names GAL, or directly affects one of GAL's service lines with an identifiable counterparty and a decision window under 60 days.
- med: relevant to a service line or a watchlist company; action window 60-180 days or impact is indirect.
- watch: context or early signal; no action needed now.
Confidence: "Certain" = confirmed in a primary or official source; "Likely" = strong inference or a single credible source; "Guessing" = analyst judgement.

Rules:
- Never invent facts, URLs, dates, or figures. Only include items you found via search. Every item needs a real source URL you actually saw.
- Say plainly what was NOT verified (e.g. "official release not read") in the "source" field.
- If outlets disagree on facts or figures, set "disputed": true and say so in "source".
- Do not repeat items already in the existing list (provided to you). If there is nothing new, return an empty items array and say so in the brief summary.
- Plain, direct, professional English. No hype. No em dashes.`;

const SCHEMA_HINT = `Return a single JSON object, no prose, no markdown fences:
{
  "items": [{
    "id": "YYYYMMDD-short-slug",
    "date": "YYYY-MM-DD",          // publication date, or event date for upcoming events
    "headline": "...",
    "priority": "high|med|watch",
    "scope": one of ${JSON.stringify(SCOPES)},
    "lines": [subset of ${JSON.stringify(LINES)}],
    "companies": ["..."],
    "confidence": "Certain|Likely|Guessing",
    "source": "outlet(s) and what was/wasn't verified",
    "url": "https://...",
    "why": "why it matters to GAL",
    "action": "suggested action, or 'No action now.'",
    "basis": "one sentence on why this rating",
    "disputed": false
  }],
  "drop": ["ids of existing items that are now wrong or superseded"],
  "brief": {
    "summary": "3-4 sentences: what changed this week for GAL, and what did not",
    "decisions": [{"topic":"...","what":"...","lead":"team or role","by":"YYYY-MM-DD"}],   // max 4, only real decisions
    "priorities": [{"name":"...","confidence":"Likely","why":"...","now":"0-2 week action","next":"30-60 day action"}],   // max 4 standing priorities
    "watch": ["things to watch next week", "..."]   // max 8
  }
}`;

async function callClaude(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 25 }],
      messages
    })
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

function extractJson(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("No JSON object in model output:\n" + text.slice(0, 500));
  return JSON.parse(text.slice(a, b + 1));
}

function cleanItem(i) {
  const bad = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date || "")) bad.push("date");
  if (!["high", "med", "watch"].includes(i.priority)) bad.push("priority");
  if (!i.headline) bad.push("headline");
  if (!/^https?:\/\//.test(i.url || "")) bad.push("url");
  if (bad.length) return { bad };
  return {
    item: {
      id: i.id && /^[\w-]+$/.test(i.id) ? i.id : i.date.replaceAll("-", "") + "-" + slug(i.headline),
      date: i.date, headline: String(i.headline), priority: i.priority,
      scope: SCOPES.includes(i.scope) ? i.scope : "Capability themes",
      lines: (i.lines || []).filter(l => LINES.includes(l)),
      companies: (i.companies || []).map(String),
      confidence: ["Certain", "Likely", "Guessing"].includes(i.confidence) ? i.confidence : "Likely",
      source: i.source || "", url: i.url, why: i.why || "", action: i.action || "", basis: i.basis || "",
      ...(i.disputed ? { disputed: true } : {})
    }
  };
}

async function main() {
  if (!KEY) { console.error("ANTHROPIC_API_KEY is not set."); process.exit(1); }
  const items = await readJson("items.json", []);
  const watchlist = await readJson("watchlist.json", []);
  const prevBrief = await readJson("brief.json", null);

  const existing = items.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60)
    .map(i => `${i.id || ""} | ${i.date} | ${i.priority} | ${i.headline} | ${i.url}`).join("\n");
  const wl = watchlist.map(w => `- ${w.name} (${w.type || ""}): ${w.note || ""}`).join("\n");

  const user = `Today is ${todayGst()} (Gulf Standard Time).

Watchlist companies (search each for news):
${wl}

Previous brief (carry forward standing priorities unless facts changed; say "No new facts this week" where true):
${JSON.stringify(prevBrief ?? {}, null, 1)}

Existing items (do not duplicate; most recent 60):
${existing}

Search for new developments across the eight service lines and the four scopes, UAE/GCC first. Then respond.

${SCHEMA_HINT}`;

  let messages = [{ role: "user", content: user }];
  let out;
  for (let turn = 0; turn < 6; turn++) {
    out = await callClaude(messages);
    if (out.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: out.content }];
  }
  const text = out.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  const parsed = extractJson(text);

  const byKey = new Map(items.map(i => [i.url || i.headline, i]));
  let added = 0, skipped = 0;
  for (const raw of parsed.items || []) {
    const { item, bad } = cleanItem(raw);
    if (!item) { skipped++; console.warn("Skipped item (invalid " + bad.join(",") + "):", raw.headline); continue; }
    if (byKey.has(item.url) || byKey.has(item.headline)) { skipped++; continue; }
    items.push(item); byKey.set(item.url, item); added++;
  }
  const drop = new Set(parsed.drop || []);
  const kept = items.filter(i => !drop.has(i.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ITEMS_KEPT);

  const b = parsed.brief || {};
  const brief = {
    refreshed: gst(),
    summary: b.summary || "",
    decisions: (b.decisions || []).slice(0, 4),
    priorities: (b.priorities || []).slice(0, 4),
    watch: (b.watch || []).slice(0, 8)
  };

  console.log(`Model ${MODEL}: +${added} items, ${skipped} skipped, ${drop.size} dropped, ${kept.length} total.`);
  if (DRY) { console.log(JSON.stringify({ brief, newItems: kept.slice(0, added) }, null, 2)); return; }
  await writeJson("items.json", kept);
  await writeJson("brief.json", brief);
}

main().catch(e => { console.error(e); process.exit(1); });
