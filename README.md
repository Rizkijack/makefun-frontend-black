# OBSIDIAN — make.fun monitor

[![bounty](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
![rank](https://make.fun/badge/makefun-frontend-01/Rizkijack/makefun-frontend-black/rank.svg)
![reward](https://make.fun/badge/makefun-frontend-01/Rizkijack/makefun-frontend-black/reward.svg)

A read-only monitor for [make.fun](https://make.fun/bounty/makefun-frontend-01): a dense registry on the left, the selected bounty on the right. No hero, no scroll-jacking, no marketing. Black canvas, one lime accent, data first.

## Run it

```sh
node serve.ts            # then open http://localhost:8080
```

Plain static files, no build step: `app/index.html` + `app/style.css` + `app/main.js` + `app/format.js` load first; every other view is a literal `import()` fetched on the route that needs it.

## Routes

| Route | Surface |
| --- | --- |
| `#/` | Registry of open bounties + the selected bounty's overview |
| `#/bounty/<slug>/overview` | Pot, phases, rewards ladder, judge plan, demand/resolution |
| `#/bounty/<slug>/rewards` | Full placement table, entry fees, prize gate, dates |
| `#/bounty/<slug>/standings` | Virtualized leaderboard, dynamic columns, per-view sort, live likes/views |
| `#/bounty/<slug>/feed` | Live comment thread |
| `#/bounty/<slug>/history` | Rank-over-time chart from the standings history samples |
| `#/u/<handle>` | Profile: record line, entries, payouts, live view count |

Every route deep-links, survives reload, and sets `window.__shotReady` when its render settles.

## Live surfaces

| Feature | Endpoint |
| --- | --- |
| Open-bounty registry, KPI band, filters, sort | `GET /api/competitions?status=open&activity=times` |
| Bounty detail (pot, phases, rewards, judges, notices) | `GET /api/competitions/<slug>` |
| Notices | `GET /api/competitions/<slug>/notices` |
| Leaderboard views, dynamic columns | `GET /api/competitions/<slug>/leaderboard?rows=first&view=overview`, then `?view=<mode>` |
| Likes / views counts | `GET /api/competitions/<slug>/likes`, `GET /api/competitions/<slug>/views` |
| Rank history chart | `GET /api/competitions/<slug>/standings/history` |
| Comment feed | `GET /api/competitions/<slug>/comments?limit=40` |
| Profile, record, solutions, payouts | `GET /api/profiles/<handle>`, `GET /api/profiles/<handle>/views` |

Dynamic columns are real: `tiny-chess-01` renders Elo / Plays / Wins / Draws / Losses / Plies to spare, `makefun-frontend-01` renders judge win rate / interval low / interval high / valid / size. Views come from the payload's own `views` array, so the switcher follows the board instead of a hardcoded list.

## Caching proof

`app/main.js` carries a small GET layer:

- **TTL cache** per URL (board 30 s, bounty/leaderboard/live 60 s, profile 120 s).
- **ETag revalidation**: the stored `etag` is sent as `If-None-Match`; a 304 (or a failed conditional request, since a cross-origin 304 surfaces as a CORS failure) keeps the cached body.
- **In-flight dedupe**: two views asking for the same URL share one promise.
- **Stale-if-error**: a non-OK response keeps the last body instead of blanking the pane.
- **503 retry**: a cold board (`"This board is being built; send this again in 5 s."`) is retried twice at 2.2 s.

The `REQ / CACHE / REVAL` counters in the cache strips are live, and every table has a REVALIDATE button that forces a conditional request.

## Load

Measured by `main.ts` (gzip-9, `node:zlib`):

```
first load    4 files   26971 B raw   8303 B gzip
later import  6 files   35620 B raw  13856 B gzip
whole app    10 files   62591 B raw   22159 B gzip
```

First load misses the 2.6 KB gzip target: the stylesheet alone is 4421 B gzip and the router + cache + keyed patch is 2501 B. The views themselves (board, bounty, leaderboard, history, feed, profile — 13856 B gzip) are behind `import()` and cost nothing until a route uses them. Shrinking the first load further means dropping the design system or the cache layer, so the actual number is reported instead.

## Notes

- Read-only: no POST/PUT/PATCH/DELETE anywhere in `app/`.
- Only make.fun and app-relative URLs; no `on*=` handlers, no `eval`, no injected script tags, no computed `import()` specifiers.
- 3D floor grid is CSS hairlines with a mask, so it never crosses data rows; the board pane is transparent to let it show through empty space.
- Mobile: 2×2 KPI grid, SUBS/ACTIVITY columns hidden, 2-line title clamp.
