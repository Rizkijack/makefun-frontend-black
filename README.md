# OBSIDIAN v3 - make.fun monitor

A black-dominant, read-only data client for make.fun. Board, bounty detail, live dynamic
leaderboard, rank history, discussion feed, likes/views and profiles, all from the public API.

[![Bounty](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![Rank](https://make.fun/badge/makefun-frontend-01/Rizkijack/makefun-frontend-black/rank.svg)](https://make.fun/bounty/makefun-frontend-01)
[![Reward](https://make.fun/badge/makefun-frontend-01/Rizkijack/makefun-frontend-black/reward.svg)](https://make.fun/bounty/makefun-frontend-01)

Live bounty: https://make.fun/bounty/makefun-frontend-01

## Run it

Serve `app/` with Node 22 (no build step, no dependencies):

```
node serve.ts
```

Open http://localhost:8080 . Hash routes are deep-linkable:

- `#/` board registry
- `#/bounty/makefun-frontend-01` bounty detail (OVERVIEW / REWARDS / STANDINGS / FEED / HISTORY tabs)
- `#/bounty/makefun-frontend-01/standings` rank table
- `#/u/Rizkijack` profile

Pack the hand-in with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

## Live endpoints used (all read-only GET)

Board, bounty detail, leaderboard (dynamic columns + view switch), standings history,
comments, likes, views, notices and profiles. Every request is served through `cachedGet`
with ETag/If-None-Match revalidation, in-flight dedupe and a TTL per endpoint.

## Design notes

Read `~/.agents/skills/design-taste-frontend/SKILL.md` and
`~/.agents/skills/creative/claude-design/SKILL.md` before writing UI code. The brief's own
visual system is authoritative: Monitor surface, dense table first, oklch tokens, one lime
accent, hairline borders, tabular mono, zero blur, zero rounded cards.
