FROM python:3.9-slim

# Instalar dependencias necesarias
RUN apt-get update && apt-get install -y \
    git \
    sqlite3 \
    make \
    gcc \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python
RUN pip3 install flask gtts

# Crear directorio de trabajo
WORKDIR /app

# Clonar el repositorio de SCOWL
RUN git clone https://github.com/en-wl/wordlist.git libscowl

# Asignar permisos de ejecución al script patch.py
RUN chmod +x /app/libscowl/util/patch.py

# Configurar SCOWL
WORKDIR /app/libscowl
RUN make
RUN find . -name "*.db" -exec mv {} /app/scowl.db \;

# Crear carpetas necesarias
WORKDIR /app
RUN mkdir -p /app/audio

# Copiar la aplicación Flask
COPY app.py /app/app.py

# Exponer el puerto de Flask
EXPOSE 5000

# Comando por defecto para ejecutar la aplicación
CMD ["python3", "app.py"]
