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
# --- Prod: published images, .env, external Nextcloud (another stack, behind
# the reverse proxy). They are pulled before starting: `up -d` only uses the
# images already on the server and never fetches a new :latest. If the
# image changed, `up -d` recreates that container.
prod:
	docker compose pull
	docker compose up -d
# Compatibility alias: `make start` used to be the prod startup.
start: prod
stop:
	docker compose down --remove-orphans

# --- Dev: local build + Nextcloud 34 with the gaming app hot-mounted,
# on the ports from .env.development (README → DEV).
DEV_ENV_FILES := --env-file .env.development $(if $(wildcard .env.development.local),--env-file .env.development.local)
DEV_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.nextcloud.yml -f docker-compose.dev.yml $(DEV_ENV_FILES) -p games-dev

dev:
	mkdir -p cache/dev/audio
	$(DEV_COMPOSE) up --build -d --wait
	@echo "Nextcloud: http://localhost:$$(grep -h '^NEXTCLOUD_PORT=' .env.development .env.development.local 2>/dev/null | tail -1 | cut -d= -f2)/apps/gaming/"
dev-stop:
	$(DEV_COMPOSE) down --remove-orphans
# Also wipes the dev data (Nextcloud, MariaDB): the next `make dev`
# reinstalls Nextcloud from scratch.
dev-reset:
	$(DEV_COMPOSE) down -v --remove-orphans
dev-logs:
	$(DEV_COMPOSE) logs -f
# occ against the dev Nextcloud, e.g.: make occ ARGS="user:list"
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