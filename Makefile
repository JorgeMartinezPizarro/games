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
# --- Prod: .env, external Nextcloud (another stack, behind the reverse proxy).
# `up -d` runs the images already on this machine (it only downloads missing
# ones) and recreates any container whose image changed. It must NOT pull:
# after `make build` the fresh local :latest would be overwritten by the older
# one on Docker Hub. Two workflows:
#   build on the server:      make build prod   (or make build push prod)
#   images built elsewhere:   make pull prod
prod:
	docker compose up -d
pull:
	docker compose pull
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

.PHONY: build push prod pull start stop dev dev-stop dev-reset dev-logs occ save load
save:
	docker compose pause
	docker build -f Dockerfile.volumes \
		-t $(VOLUMES_IMAGE):gaming-app-latest \
		-t $(VOLUMES_IMAGE):gaming-app-$(DATE) .
	docker compose unpause
	docker push $(VOLUMES_IMAGE):gaming-app-latest
	docker push $(VOLUMES_IMAGE):gaming-app-$(DATE)
# The database is replaced with MariaDB STOPPED, not paused: a paused MariaDB keeps the database it has in memory
# and overwrites the copied files when it resumes (on a fresh server the restored scores were lost that way).
# The backup (save) can pause: a paused copy is consistent, like after a power cut, and MariaDB recovers it.
# cache/database is emptied, not removed: a bind mount keeps pointing at the same folder (Docker Desktop needs it).
load:
	docker pull $(VOLUMES_IMAGE):gaming-app-latest
	docker rm -f gaming-app-volumes-tmp >/dev/null 2>&1 || true
	docker create --name gaming-app-volumes-tmp $(VOLUMES_IMAGE):gaming-app-latest
	docker compose stop
	mkdir -p ./cache/database
	find ./cache/database -mindepth 1 -delete
	docker cp gaming-app-volumes-tmp:/cache/. ./cache
	docker rm gaming-app-volumes-tmp
	docker compose up -d