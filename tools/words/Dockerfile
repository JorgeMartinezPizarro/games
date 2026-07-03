FROM python:3.12-slim

# dependencias del sistema
RUN apt-get update && apt-get install -y \
    git \
    make \
    sqlite3 \
    bash \
    && rm -rf /var/lib/apt/lists/*

# dependencias python
RUN pip install flask gtts

WORKDIR /app

# clonar repo
RUN git clone https://github.com/en-wl/wordlist.git libscowl

WORKDIR /app/libscowl

# 🔥 build oficial del repo
RUN make

# validar output
RUN test -f scowl.db

# mover DB
RUN cp scowl.db /app/scowl.db

WORKDIR /app
RUN mkdir -p audio

COPY app.py /app/app.py

EXPOSE 5000

CMD ["python", "app.py"]