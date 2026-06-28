from flask import Flask, jsonify, request, send_from_directory
import sqlite3
import random
from gtts import gTTS
import os
import logging

app = Flask(__name__)

DATABASE = "/app/scowl.db"
AUDIO_FOLDER = "/app/audio"

os.makedirs(AUDIO_FOLDER, exist_ok=True)

# ----------------------------
# LOGGING CONFIG
# ----------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

def inspect_db():
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        logging.info("=== SQLITE DATABASE INSPECTION ===")
        logging.info(f"Database: {DATABASE}")
        if not tables:
            logging.warning("No tables found in database!")
            return
        for (table,) in tables:
            logging.info(f"\nTABLE: {table}")
            cursor.execute(f"PRAGMA table_info({table})")
            columns = cursor.fetchall()
            for col in columns:
                cid, name, coltype, notnull, default, pk = col
                logging.info(
                    f"  - {name} ({coltype}) "
                    f"NOT NULL={notnull} PK={pk} DEFAULT={default}"
                )
        logging.info("=== END DB INSPECTION ===")
    except Exception as e:
        logging.error(f"DB inspection failed: {e}")
    finally:
        try:
            conn.close()
        except:
            pass


inspect_db()


# ----------------------------
# HELPERS
# ----------------------------

BASE_FILTER = """
    FROM words w
    JOIN scowl_data sd ON sd.group_id = w.group_id AND sd.pos = w.pos
    WHERE w.word NOT LIKE '% %'
      AND w.word NOT LIKE '%-%'
      AND w.word NOT LIKE "%'%"
      AND w.word GLOB '[a-z]*'
      AND LENGTH(w.word) BETWEEN 4 AND 9
      AND sd.size <= 60
      AND sd.region IN ('', 'US')
      AND w.pos IN ('n0','v0','aj0','av0')
"""

def get_audio_path(word: str) -> str:
    return os.path.join(AUDIO_FOLDER, f"{word}.mp3")

def ensure_audio(word: str) -> str:
    """Genera el MP3 si no existe. Devuelve la ruta."""
    audio_path = get_audio_path(word)
    if not os.path.exists(audio_path):
        tts = gTTS(word, lang='en')
        tts.save(audio_path)
    return audio_path


# ----------------------------
# ENDPOINTS
# ----------------------------

@app.route('/word', methods=['GET'])
@app.route('/word/<string:word>', methods=['GET'])
def get_word(word=None):
    """Endpoint legacy: devuelve una sola palabra + audio."""
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()

        if word:
            cursor.execute(
                "SELECT word FROM words WHERE word = ? LIMIT 1",
                (word,)
            )
        else:
            cursor.execute(
                f"SELECT DISTINCT w.word {BASE_FILTER} ORDER BY RANDOM() LIMIT 1"
            )

        result = cursor.fetchone()
        if not result:
            return jsonify({"error": "Word not found"}), 404

        word = result[0]
        ensure_audio(word)

        return jsonify({
            "word": word,
            "audio": f"/audio/{word}.mp3",
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route('/challenge', methods=['GET'])
def get_challenge():
    """
    Devuelve todas las palabras y audios para una partida completa.

    Query params:
      - rounds:     número de rondas (default 10)
      - choices:    palabras por ronda (default 4)
      - size:       dificultad SCOWL, menor = más común (default 60)

    Respuesta:
      {
        "rounds": [
          {
            "target": "forgiver",
            "audio":  "/audio/forgiver.mp3",
            "choices": ["forgiver", "cottager", "sparely", "dagger"]  <- barajadas
          },
          ...
        ]
      }
    """
    try:
        rounds  = int(request.args.get('rounds',  10))
        choices = int(request.args.get('choices', 4))
        size    = int(request.args.get('size',    60))

        total_needed = rounds * choices  # 10 * 4 = 40

        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()

        cursor.execute(
            f"SELECT DISTINCT w.word {BASE_FILTER} ORDER BY RANDOM() LIMIT ?",
            (total_needed,)
        )
        words = [r[0] for r in cursor.fetchall()]
        conn.close()

        if len(words) < total_needed:
            return jsonify({"error": "Not enough words in database"}), 500

        # Las primeras `rounds` palabras son las reales (con audio)
        targets     = words[:rounds]
        distractors = words[rounds:]  # rounds * (choices-1) palabras

        # Generar audios solo para las palabras reales
        for word in targets:
            ensure_audio(word)

        # Construir las rondas
        result_rounds = []
        for i, target in enumerate(targets):
            # 3 distractoras para esta ronda
            round_distractors = distractors[i * (choices - 1) : (i + 1) * (choices - 1)]
            round_choices = [target] + round_distractors
            random.shuffle(round_choices)

            result_rounds.append({
                "target":  target,
                "audio":   f"/audio/{target}.mp3",
                "choices": round_choices,
            })

        return jsonify({"rounds": result_rounds})

    except Exception as e:
        logging.error(f"Error in /challenge: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/audio/<string:filename>', methods=['GET'])
def serve_audio(filename):
    return send_from_directory(AUDIO_FOLDER, filename)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)