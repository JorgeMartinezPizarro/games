# Base image with the required tools
FROM python:3.12-slim

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    cmake \
    gcc \
    g++ \
    make \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Clone and build Stockfish
RUN git clone https://github.com/official-stockfish/Stockfish.git /tmp/stockfish \
    && cd /tmp/stockfish/src \
    && make build ARCH=x86-64-modern \
    && mv /tmp/stockfish/src/stockfish /usr/local/bin/stockfish \
    && rm -rf /tmp/stockfish

# Install Flask
RUN pip3 install flask

# Copy the application
COPY app.py /app.py

# Expose the port
EXPOSE 8080

# Run the application
CMD ["python3", "/app.py"]
