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
start:
	docker compose up -d
stop:
	docker compose down --remove-orphans
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