# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private Nextcloud extension bundling 4 web games (chess, tetris, numbers, words) as a Next.js
(App Router) app, using Nextcloud's session cookie as the auth/identity provider. No tracking, no
ads — scores are the only persisted user data.

## Commands

```bash
npm run dev              # node run.js dev   — reads DEV_PORT from env/.env(.local), default 3000
npm run build             # next build
npm run start             # node run.js start — reads PORT from env/.env(.local), default 3000
npm run lint               # next lint
npm run test               # vitest run (single run, all *.test.{ts,tsx})
npm run test:watch     # vitest watch mode
npm run test:e2e         # playwright test — spins up the full docker-compose stack (games + stockfish + wordlist) via .env.e2e
npm run test:e2e:down  # tear down the e2e docker stack
```

Run a single unit test file: `npx vitest run app/hooks/useTetris.test.ts`
Run a single e2e spec: `npx playwright test e2e/tetris.spec.ts`

Local dev without a real Nextcloud instance: set `NEXT_PUBLIC_ENABLE_LOGIN=false` in `.env` (see
`.env.sample`) and requests are treated as `NEXT_PUBLIC_DEV_USER` (default `peter`), bypassing both
the auth middleware and `requireAuth`.

The app is served under the basePath `/bookmarks` (`next.config.mjs`) — all internal links/assets
include that prefix.

## Architecture

### Per-game module convention (enforced, see `AGENTS.md`)

Each game follows the same 3-layer split — keep this shape when touching a game:

- **`app/lib/<game>/`** — pure game logic + SQLite persistence (`db.ts`, `engine.ts`/`board.ts`,
  `rng.ts`, `replay.ts`). No React, no Next.js imports.
- **`app/hooks/use<Game>.ts` / `use<Game>Score.ts`** — all state and business logic as React
  hooks. `use<Game>Score` handles submitting the finished game's score.
- **`app/pages/games/<game>/page.tsx`** — composition/rendering only, no business logic.

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

- `proxy.ts` (Next middleware, matches `/pages/:path*`) gates page navigation: validates the
  Nextcloud session cookie against `${NEXTCLOUD_URL}/ocs/v2.php/cloud/user`, redirects to `/login`
  on any failure.
- `app/lib/auth.ts#requireAuth` does the equivalent check for API routes, with a 60s in-memory
  cache keyed by the raw cookie string to avoid hitting Nextcloud on every request.
- Both short-circuit to a fixed dev user when `NEXT_PUBLIC_ENABLE_LOGIN=false`.

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
- E2E tests (Playwright, `e2e/*.spec.ts`) run against the real dockerized stack (games + stockfish +
  wordlist), configured via `.env.e2e`, `fullyParallel: false` and `workers: 1` since all four games
  share one infra instance.
