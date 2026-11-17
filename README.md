# OBSIDIAN — make.fun monitor

Black-dominant, data-dense read-only client for [make.fun](https://make.fun)'s public API. Monitor bounties, standings, rank history, discussion and profiles. Built as plain static files — no build step, no dependencies.

![Live bounty](https://make.fun/badge/makefun-frontend-01.svg)
![Rank](https://make.fun/badge/makefun-frontend-01/Rizkijack/makefun-frontend-black/rank.svg)
![Reward](https://make.fun/badge/makefun-frontend-01/Rizkijack/makefun-frontend-black/reward.svg)

Bounty: [makefun-frontend-01](https://make.fun/bounty/makefun-frontend-01)

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Hash routes (deep-linkable): `#/` (registry), `#/bounty/makefun-frontend-01`, `#/bounty/makefun-frontend-01/standings`, `#/u/Rizkijack`.

## Build / hand-in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Writes `app/` + `screenshots/` + `dossier.json` into `out/`. The dossier is produced by `vendor/makefun-frontend.ts`'s `buildDossier`, so it matches the judge's own computation byte-for-byte.

## Live endpoints used (all read-only GET)

- `GET /api/competitions?status=open&activity=times` — registry + KPIs
- `GET /api/competitions/<slug>?submissions=summary` — detail, rewards, phases
- `GET /api/competitions/<slug>/leaderboard?rows=first&view=<name>` — dynamic columns + views
- `GET /api/competitions/<slug>/standings/history` — rank-over-time chart
- `GET /api/competitions/<slug>/comments` — discussion feed
- `GET /api/competitions/<slug>/likes`, `/views` — live per-row glyph counts
- `GET /api/competitions/<slug>/notices` — notice banner
- `GET /api/profiles/<handle>` — public profile

All requests go through an ETag cache (`cachedGet`): TTL cache, `If-None-Match` revalidation on 304, in-flight dedupe. The status bar shows `REQ · CACHE · REVAL · READ ONLY`.
