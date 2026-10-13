#!/bin/sh
# Deja la app gaming lista en el Nextcloud de dev/e2e. La imagen oficial lo
# ejecuta como www-data en cada arranque (hook before-starting), después de
# instalar/actualizar y antes de servir peticiones: todo debe ser idempotente.
set -eu

occ() {
  php /var/www/html/occ "$@"
}

occ app:enable gaming
occ config:app:set gaming games_url --value="$GAMING_GAMES_URL"
occ config:app:set gaming shared_secret --value="$GAMING_SHARED_SECRET" --sensitive
# Sin asistente de bienvenida tapando el iframe en cada usuario nuevo.
occ app:disable firstrunwizard || true

for user in $GAMING_TEST_USERS; do
  if ! occ user:info "$user" >/dev/null 2>&1; then
    OC_PASS="$GAMING_TEST_PASSWORD" php /var/www/html/occ user:add --password-from-env --display-name="$user" "$user"
  fi
done
