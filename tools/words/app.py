from flask import Flask, jsonify, request, send_from_directory
import sqlite3
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
    """Imprime tablas y esquema completo al arrancar"""
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

            if not columns:
                logging.warning(f"  (no columns found for {table})")
                continue

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


# Ejecutar al importar (arranque del contenedor)
inspect_db()


# ----------------------------
# ENDPOINTS
# ----------------------------

@app.route('/word', methods=['GET'])
@app.route('/word/<string:word>', methods=['GET'])
def get_word(word=None):
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
                "SELECT word FROM words "
                "WHERE word NOT LIKE '% %' "
                "  AND word NOT LIKE '%-%' "
                "  AND word NOT LIKE \"%'%\" "
                "  AND word GLOB '[A-Za-z]*' "
                "ORDER BY RANDOM() LIMIT 1"
            )

        result = cursor.fetchone()
        if not result:
            return jsonify({"error": "Word not found"}), 404

        word = result[0]
        audio_path = os.path.join(AUDIO_FOLDER, f"{word}.mp3")

        if not os.path.exists(audio_path):
            tts = gTTS(word, lang='en')
            tts.save(audio_path)

        return jsonify({
            "word": word,
            "audio": f"/audio/{word}.mp3",
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        conn.close()


@app.route('/audio/<string:filename>', methods=['GET'])
def serve_audio(filename):
    return send_from_directory(AUDIO_FOLDER, filename)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)