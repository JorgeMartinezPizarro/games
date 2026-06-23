FROM python:3.9-slim

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python
RUN pip3 install flask gtts

# Crear directorio de trabajo
WORKDIR /app

# Clonar el repositorio de SCOWL
RUN git clone https://github.com/en-wl/wordlist.git libscowl

# Instalar libscowl como paquete Python (necesario para combine.py)
WORKDIR /app/libscowl
RUN pip3 install -e .

# Generar la base de datos
RUN python3 combine.py create-db /app/scowl.db

# Crear carpeta de audio
WORKDIR /app
RUN mkdir -p /app/audio

# Copiar la aplicación Flask
COPY app.py /app/app.py

# Exponer el puerto de Flask
EXPOSE 5000

CMD ["python3", "app.py"]