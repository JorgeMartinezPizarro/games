# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private Nextcloud extension bundling 4 web games (chess, tetris, numbers, words) as a Next.js
(App Router) app, using Nextcloud's session cookie as the auth/identity provider. No tracking, no
ads — scores are the only persisted user data.

## Commands

```bash
make dev                 # dev stack (docker, in WSL): local games build + Nextcloud 34 with the gaming app hot-mounted, ports from .env.development
make dev-stop / dev-reset / dev-logs / occ ARGS="..."
make prod                # docker compose up -d with .env (prod; Nextcloud is an external stack behind the reverse proxy)
npm run dev              # node run.js dev   — next dev on DEV_PORT, reads .env.development (same Nextcloud/services as `make dev`)
npm run build             # next build
npm run start             # node run.js start — reads PORT from env/.env(.local), default 3000
npm run lint               # next lint
npm run test               # vitest run (single run, all *.test.{ts,tsx})
npm run test:watch     # vitest watch mode
npm run test:e2e         # playwright test — spins up the full docker-compose stack (games + Nextcloud 34 + stockfish + wordlist) via .env.e2e
npm run test:e2e:down  # tear down the e2e docker stack
```

Run a single unit test file: `npx vitest run app/hooks/useTetris.test.ts`
Run a single e2e spec: `npx playwright test e2e/tetris.spec.ts`

There is no mode without login (the old `NEXT_PUBLIC_ENABLE_LOGIN=false` bypass was removed): local
dev and e2e use the Nextcloud 34 container from `docker-compose.nextcloud.yml`. Test users and
passwords are in `.env.development` / `.env.e2e`.

The app is served under the basePath `/bookmarks` (`next.config.mjs`) — all internal links/assets
include that prefix.

## Architecture

### Per-game module convention (enforced, see `AGENTS.md`)

Each game follows the same 3-layer split — keep this shape when touching a game:

- **`app/lib/<game>/`** — pure game logic + SQLite persistence (`db.ts`, `engine.ts`/`board.ts`,
  `rng.ts`, `replay.ts`). No React, no Next.js imports.
- **`app/hooks/use<Game>.ts` / `use<Game>Score.ts`** — all state and business logic as React
  hooks. `use<Game>Score` handles submitting the finished game's score.
- **`app/components/<game>/`** — presentational pieces of that game, styled with a CSS module
  (`<Game>.module.css`).
- **`app/pages/games/<game>/page.tsx`** — composition/rendering only, no business logic.

### UI system

- Dark design tokens (`--bg`, `--surface`, `--line`, `--text`, per-game `--chess`/`--words`/
  `--numbers`/`--tetris`) live in `app/globals.css`; `app/theme.ts` maps MUI onto them. Each game
  sets its `--accent` through `GameShell`, and anything that derives from it needs the
  `accent-scope` class on the element that redefines it.
- Shared components in `app/components/`: `GameShell` (top bar + accent), `Leaderboard`,
  `ResultPanel`, `ui.tsx` (`StatTile`, `RankBadge`, `GameIntro`, `Notice`), `gameCatalog.ts`
  (names, descriptions, routes of the 4 games).
- Fonts come from `next/font` (self-hosted at build time): never load fonts or other assets from
  third-party CDNs at runtime ("no tracking").
- E2E tests select by role, label or `data-testid` (`answer`, `result-title`, `rank`, `lines`,
  `cell-N`, `best-<game>`…), never by CSS class: CSS module class names are hashed.

`AGENTS.md` at the repo root encodes stricter rules for *refactor* requests specifically (diff-only
output, one change per response, several routes/areas marked as never-touch). Read it before doing
a refactor task.

### Anti-cheat: server-authoritative replay, not trusted scores

No game ever accepts a client-submitted score directly. The flow is the same for
tetris/numbers/words/chess:

1. `POST /api/<game>/new-game` creates a row keyed by a server-generated `nonce` (in
   `app/lib/<game>/db.ts`), storing whatever is needed to replay deterministically (an RNG seed for
   tetris/numbers, a target word/board for words/numbers). The nonce has a max age.
2. The client hook (`app/hooks/use<Game>.ts`) plays the game entirely client-side against that seed
   and records an action/move log with timestamps.
3. On completion, the client posts `{ nonce, actions/moves }` to `POST /api/scores`
   (`app/api/scores/route.ts`), which:
   - `consume<Game>Game(nonce)` — one-time read-and-delete of the stored seed/state (nonce reuse is
     impossible).
   - `replay<Game>(...)` (`app/lib/<game>/replay.ts` or `board.ts`) — independently recomputes the
     outcome server-side from the seed + action log.
   - Only if the recomputed outcome is a legitimate win/score does it call `insertScore`.
4. Chess is the special case: the player always plays White, Stockfish (external service, see
   below) plays Black server-side. A game only scores if replay ends with Black to move and in
   checkmate (`turn() === "b" && isCheckmate()`) — draws/stalemate/self-inflicted mate don't count.

When changing scoring logic, the client and the corresponding `replay*`/`board.ts` logic must
stay in sync, or legitimate wins will be silently rejected by `/api/scores`.

### Auth

- `proxy.ts` (Next middleware, matches `/` and `/pages/:path*`) gates page navigation: validates
  the Nextcloud session cookie against `${NEXTCLOUD_URL}/ocs/v2.php/cloud/user` and on any failure
  redirects to the Nextcloud login (`NEXTCLOUD_PUBLIC_URL`, default `NEXTCLOUD_URL`) with
  `redirect_url=/index.php/apps/gaming/<same path>`, so after logging in the user lands on that
  page inside the Nextcloud app. There is no `/login` page in this app.
- `app/lib/auth.ts#requireAuth` does the equivalent check for API routes, with a 60s in-memory
  cache keyed by the raw cookie string to avoid hitting Nextcloud on every request.
- Validated scores are forwarded to the Nextcloud `gaming` app (`nextcloud/custom_apps/gaming`)
  as activities / "record beaten" notifications via `app/lib/nextcloud/gamingApp.ts`: OCS calls
  with the user's cookie, HMAC-signed with `NEXTCLOUD_GAMING_SECRET` (the app's `shared_secret`),
  so users can't post scores to Nextcloud directly.
- The Nextcloud app shows the games in an iframe; `/apps/gaming/<path>` deeplinks to
  `<games_url>/<path>`, and `app/hooks/useNextcloudFrameSync.ts` posts each navigation back so
  Nextcloud's URL follows the iframe.

### External services (docker-compose, not part of the Next.js app)

- `tools/chess` — Flask wrapper around a long-lived Stockfish subprocess (`NEXT_PUBLIC_CHESS_URL` /
  `http://stockfish:8080` in compose).
- `tools/words` — Flask service backed by a SQLite word list (`scowl.db`) plus gTTS for word audio
  (`NEXT_PUBLIC_WORD_URL` / `http://wordlist:5000` in compose). Generated audio is cached under
  `cache/audio/`.
- The main app's own SQLite score/game-state DB lives under `cache/database/` (see `getDb()` in
  `app/lib/scores/db.ts`).

Both services are built/pushed via `Makefile` (`make build`, `make push`) as
`jorgemartinezpizarro/{games,stockfish,wordlist}`.

### Tests

- Unit tests (Vitest) live next to the code as `*.test.ts`, concentrated in `app/hooks/*.test.ts`
  and the `app/api/*/route.test.ts` files that exercise the replay/anti-cheat logic.
- E2E tests (Playwright, `e2e/*.spec.ts`) run against the real dockerized stack (games + Nextcloud
  34 + stockfish + wordlist), configured via `.env.e2e`, `fullyParallel: false` and `workers: 1`
  since all four games share one infra instance. `e2e/auth.setup.ts` logs in to Nextcloud once and
  every spec reuses that session (storageState).
