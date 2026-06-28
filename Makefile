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