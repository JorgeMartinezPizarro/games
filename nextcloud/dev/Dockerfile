# Nextcloud 34 para `make dev` y los e2e (en prod Nextcloud vive en su propio
# stack, detrás del reverse proxy). La app gaming NO va en la imagen: se monta
# en caliente desde el repo (ver docker-compose.nextcloud.yml).
#
# El hook y el .ini se copian en vez de montarse porque los ficheros montados
# desde /mnt/c llegan al contenedor sin permiso de ejecución para www-data, y
# la imagen oficial se salta los hooks que no son ejecutables.
FROM nextcloud:34-apache

COPY --chmod=644 php-dev.ini /usr/local/etc/php/conf.d/zz-gaming-dev.ini
COPY --chmod=755 before-starting.sh /docker-entrypoint-hooks.d/before-starting/10-gaming.sh
