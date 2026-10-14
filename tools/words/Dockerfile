FROM python:3.9

# system dependencies
RUN apt-get update && apt-get install -y \
    git \
    make \
    sqlite3 \
    bash \
    && rm -rf /var/lib/apt/lists/*

# python dependencies
RUN pip install flask gtts

WORKDIR /app

# clone repo
RUN git clone https://github.com/en-wl/wordlist.git libscowl

WORKDIR /app/libscowl

# 🔥 the repo's official build
RUN make

# validate output
RUN test -f scowl.db

# move DB
RUN cp scowl.db /app/scowl.db

WORKDIR /app
RUN mkdir -p audio

COPY app.py /app/app.py

EXPOSE 5000

CMD ["python", "app.py"]