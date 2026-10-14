#!/bin/sh
# Gets the gaming app ready in the dev/e2e Nextcloud. The official image runs
# it as www-data on every startup (before-starting hook), after
# installing/upgrading and before serving requests: everything must be idempotent.
set -eu

occ() {
  php /var/www/html/occ "$@"
}

occ app:enable gaming
occ config:app:set gaming games_url --value="$GAMING_GAMES_URL"
occ config:app:set gaming shared_secret --value="$GAMING_SHARED_SECRET" --sensitive
# No first-run wizard covering the iframe for every new user.
occ app:disable firstrunwizard || true

for user in $GAMING_TEST_USERS; do
  if ! occ user:info "$user" >/dev/null 2>&1; then
    OC_PASS="$GAMING_TEST_PASSWORD" php /var/www/html/occ user:add --password-from-env --display-name="$user" "$user"
  fi
done
