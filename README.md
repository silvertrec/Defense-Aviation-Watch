# Defense Aviation Watch

Standalone, mobile-friendly copy of the Claude artifact. No server needed.

- `site/` is the app: static HTML/CSS/JS, installable as a phone app (PWA), works offline from cache.
- `site/data/*.json` is the database (`items.json`, `brief.json`, `watchlist.json`), seeded with the 46 items and the latest brief from the artifact.
- `agent/refresh.mjs` is the daily agent: Claude API + web search, merges new items, rewrites the brief.
- `.github/workflows/refresh.yml` runs the agent at 06:59 Gulf time, Mon to Fri, and commits the data. The host redeploys on each commit.

## Deploy (about 10 minutes)

1. Create a **private** GitHub repo and push this folder.
2. Repo > Settings > Secrets and variables > Actions: add secret `ANTHROPIC_API_KEY`. Optional variable `AGENT_MODEL` (default `claude-sonnet-5-5`).
3. Host `site/` (publish directory `site`, no build command). Any of:
   - **Cloudflare Pages** (recommended): connect the repo, output dir `site`. Add **Cloudflare Access** (free to 50 users) so only your team can open it.
   - **Netlify**: connect the repo; `netlify.toml` is included. Add password protection or SSO in site settings (paid plan).
   - **Azure Static Web Apps / Vercel**: same idea, output dir `site`.
4. Actions tab > "Refresh Defense Aviation Watch" > Run workflow, to test the agent once.
5. On a phone: open the URL, then Share > Add to Home Screen.

**Keep it access-controlled.** The data names GAL, suggested actions and decisions. A public static URL is readable by anyone who finds it (`noindex` is set, but that is not security).

## Run locally

```bash
npx serve site                         # view the app
ANTHROPIC_API_KEY=sk-... node agent/refresh.mjs --dry   # preview a refresh, writes nothing
```

## Notes

- The original scheduled agent's exact instructions were not available to copy. `agent/refresh.mjs` rebuilds them from the artifact's rubric, service lines, scopes and watchlist. Compare its first few runs with the Claude version and tune `SYSTEM` in that file.
- Edit `site/data/watchlist.json` to change which companies are searched.
- The "Data link" lamp turns amber if the last refresh is over 3 hours late and red after 27 hours.
- Each run costs a handful of web searches plus one long model call. Cap it with `max_uses` in `refresh.mjs`.
