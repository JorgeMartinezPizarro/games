# Imagen base con herramientas necesarias
FROM debian:bullseye-slim

# Instalar dependencias
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    build-essential \
    cmake \
    gcc \
    g++ \
    make \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Clonar y compilar Stockfish
RUN git clone https://github.com/official-stockfish/Stockfish.git /tmp/stockfish \
    && cd /tmp/stockfish/src \
    && make build ARCH=x86-64-modern \
    && mv /tmp/stockfish/src/stockfish /usr/local/bin/stockfish \
    && rm -rf /tmp/stockfish

# Instalar Flask
RUN pip3 install flask

# Copiar la aplicación
COPY app.py /app.py

# Exponer el puerto
EXPOSE 8080

# Ejecutar la aplicación
CMD ["python3", "/app.py"]
