# Gaming (Nextcloud app)

Shows the games web app inside Nextcloud and turns its scores into
Nextcloud activities and notifications.

## Install

Copy (or mount) this folder as `custom_apps/gaming` in your Nextcloud
(30–34), then:

```bash
occ app:enable gaming
occ config:app:set gaming games_url --value="https://games.example.com/bookmarks"
occ config:app:set gaming shared_secret --value="<long random string>" --sensitive
```

- `games_url`: base URL of the games app, including its base path. The page
  shows a configuration hint until it is set.
- `shared_secret`: the same value as `NEXTCLOUD_GAMING_SECRET` in the games
  app. Without it, the API answers 503 and nothing is published.

A random secret: `openssl rand -hex 32`.

## Deeplinks

Every path below the app root opens the same path of the games app:

| Nextcloud                            | iframe                             |
| ------------------------------------ | ---------------------------------- |
| `/apps/gaming/`                      | `<games_url>`                      |
| `/apps/gaming/pages/games/tetris`    | `<games_url>/pages/games/tetris`   |
| `/apps/gaming/pages/games/chess?x=1` | `<games_url>/pages/games/chess?x=1` |

While playing, the games app posts its current route to Nextcloud
(`gaming:navigate` message) and `js/main.js` mirrors it in the address bar, so
reloading or sharing the URL keeps the same game open. Activities and
notifications link straight to the game they are about.

## API (called by the games server only)

OCS endpoints, authenticated with the user's Nextcloud session **and** an
HMAC signature:

- `POST /ocs/v2.php/apps/gaming/api/v1/score` — publishes "X scored Y in Z" to
  every user who can open the app.
- `POST /ocs/v2.php/apps/gaming/api/v1/notify` — notifies `targetUserId` that
  their record was beaten.

Headers:

- `X-Gaming-Timestamp`: Unix time in seconds (±5 min allowed)
- `X-Gaming-Signature`: hex `HMAC-SHA256(shared_secret, "<timestamp>.<raw body>")`

The JSON body must carry `userId` equal to the session user. The games server
only signs a score after replaying the game, so a user calling these
endpoints directly with their own session can't publish made-up scores.
