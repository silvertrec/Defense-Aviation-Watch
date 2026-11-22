# Defense Aviation Watch

Daily market-intelligence dashboard for GAL commercial strategy. Answer first: bottom line, decisions, priorities, then evidence.

## How it fits together

| Piece | What it does |
|---|---|
| `site/` | The dashboard. Static HTML, CSS and JS that reads `site/data/*.json`. Hosted on Cloudflare (Workers static assets, see `wrangler.jsonc`) and redeployed on every push to `main`. |
| `agent/AGENT.md` | The analyst's operating manual: passes, rating rubric, schemas, writing standards. **The only place agent behaviour is defined.** |
| Claude Code routine | Runs each weekday at 06:59 Gulf time (02:59 UTC), follows `agent/AGENT.md`, commits to `main`. Runs on the Claude plan, no API key. |
| `tools/validate.mjs` | Data validator. Run by the routine before it pushes, and by GitHub on every push (`.github/workflows/validate.yml`). |

## Data files (`site/data/`)

- `items.json`: signals. Each has a signal type, an evidence tier (Primary, Corroborated, Single source), priority, so-what and action.
- `decisions.json`: the decision register. **People close decisions; the agent never does.** To close one, edit the file on GitHub: set `status` to `done` (or `dropped`), add today's date to `closed`, and add a `note`.
- `brief.json`: bottom line, summary, what changed, standing priorities, watch list.
- `watchlist.json`: companies searched every run. Entries starting "Proposed:" are on trial and show a Trial tag.
- `runs.json`: one line per run (items added, sources checked, blocked domains). Feeds the Evidence and coverage panel.

## Dashboard features

Bottom line first; decision register with overdue flags; priorities with a "trigger to watch"; activity by service line; upcoming events with calendar export (.ics); competitor and partner watch; weekly signal volume; evidence and coverage panel; full-text search; filters by priority, scope, service line, company, signal type and evidence; "new since your last visit"; archive of old watch items; shareable filtered links (the filter state is in the URL); CSV export; copy-as-text brief; print or save the brief as PDF (prints high and medium signals only).

## Everyday tasks

- **Change what the agent does:** edit `agent/AGENT.md` on GitHub and commit. The next run follows it.
- **Add or remove a watched company:** edit `site/data/watchlist.json`.
- **Close a decision:** see `decisions.json` above.
- **Check data locally:** `node tools/validate.mjs` (needs Node 18+).
- **Run the routine now:** open the routine at https://claude.ai/code/routines and choose Run now.

## Notes

- Evidence labels and signal types on the 49 items that existed before the upgrade were assigned by keyword rules, then hand-corrected where wrong. They are reasonable but not re-verified. Items added after the upgrade are labelled by the agent from the sources it read.
- The routine can only read sites its cloud environment allows. If `runs.json` shows blocked domains, add them in the routine environment's network settings.
- Public-source intelligence compiled by an AI agent. Verify before external use.
