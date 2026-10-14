# Nextcloud 34 for `make dev` and the e2e tests (in prod Nextcloud lives in its
# own stack, behind the reverse proxy). The gaming app is NOT in the image: it
# is hot-mounted from the repo (see docker-compose.nextcloud.yml).
#
# The hook and the .ini are copied instead of mounted because files mounted
# from /mnt/c reach the container without execute permission for www-data, and
# the official image skips hooks that aren't executable.
FROM nextcloud:34-apache

COPY --chmod=644 php-dev.ini /usr/local/etc/php/conf.d/zz-gaming-dev.ini
COPY --chmod=755 before-starting.sh /docker-entrypoint-hooks.d/before-starting/10-gaming.sh
