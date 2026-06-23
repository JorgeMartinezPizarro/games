build:
	docker build -t jorgemartinezpizarro/bookmarks:latest . 
	docker push jorgemartinezpizarro/bookmarks:latest
	cd tools/chess
	docker build -t jorgemartinezpizarro/stockfish:latest . 
	docker push jorgemartinezpizarro/stockfish:latest
	cd tools/words
	docker build -t jorgemartinezpizarro/wordlist:latest . 
	docker push jorgemartinezpizarro/wordlist:latest
start:
	docker compose up -d
stop:
	docker compose down --remove-orphans