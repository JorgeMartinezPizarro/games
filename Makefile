-include .env

DATE := $(shell date +%d-%m-%Y)
VOLUMES_IMAGE := $(VOLUMES_DOCKER_USER)/$(VOLUMES_IMAGE_NAME)

build:
	docker build -t jorgemartinezpizarro/games:latest . && \
	cd tools/chess && \
	docker build -t jorgemartinezpizarro/stockfish:latest .  && \
	cd ../../tools/words && \
	docker build -t jorgemartinezpizarro/wordlist:latest .
push:
	docker push jorgemartinezpizarro/games:latest && \
	cd tools/chess && \
	docker push jorgemartinezpizarro/stockfish:latest && \
	cd ../../tools/words && \
	docker push jorgemartinezpizarro/wordlist:latest
# --- Prod: imágenes publicadas, .env, Nextcloud externo (otro stack, detrás
# del reverse proxy).
prod:
	docker compose up -d
# Alias de compatibilidad: `make start` era el arranque de prod.
start: prod
stop:
	docker compose down --remove-orphans

# --- Dev: build local + Nextcloud 34 con la app gaming montada en caliente,
# en los puertos de .env.development (README → Desarrollo).
DEV_ENV_FILES := --env-file .env.development $(if $(wildcard .env.development.local),--env-file .env.development.local)
DEV_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.nextcloud.yml -f docker-compose.dev.yml $(DEV_ENV_FILES) -p games-dev

dev:
	mkdir -p cache/dev/audio
	$(DEV_COMPOSE) up --build -d --wait
	@echo "Nextcloud: http://localhost:$$(grep -h '^NEXTCLOUD_PORT=' .env.development .env.development.local 2>/dev/null | tail -1 | cut -d= -f2)/apps/gaming/"
dev-stop:
	$(DEV_COMPOSE) down --remove-orphans
# Borra también los datos de dev (Nextcloud, MariaDB): el próximo `make dev`
# reinstala Nextcloud desde cero.
dev-reset:
	$(DEV_COMPOSE) down -v --remove-orphans
dev-logs:
	$(DEV_COMPOSE) logs -f
# occ contra el Nextcloud de dev, p. ej.: make occ ARGS="user:list"
occ:
	$(DEV_COMPOSE) exec -u www-data nextcloud php occ $(ARGS)

.PHONY: build push prod start stop dev dev-stop dev-reset dev-logs occ save load
save:
	docker compose pause
	docker build -f Dockerfile.volumes \
		-t $(VOLUMES_IMAGE):gaming-app-latest \
		-t $(VOLUMES_IMAGE):gaming-app-$(DATE) .
	docker compose unpause
	docker push $(VOLUMES_IMAGE):gaming-app-latest
	docker push $(VOLUMES_IMAGE):gaming-app-$(DATE)
load:
	docker pull $(VOLUMES_IMAGE):gaming-app-latest
	docker create --name gaming-app-volumes-tmp $(VOLUMES_IMAGE):gaming-app-latest
	docker compose pause
	docker cp gaming-app-volumes-tmp:/cache/. ./cache
	docker compose unpause
	docker rm gaming-app-volumes-tmp