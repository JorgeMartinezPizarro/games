from flask import Flask, jsonify, request, send_from_directory
import sqlite3
from gtts import gTTS
import os

app = Flask(__name__)

DATABASE = "/app/scowl.db"
AUDIO_FOLDER = "/app/audio"

# Crear directorio de audio si no existe
os.makedirs(AUDIO_FOLDER, exist_ok=True)

@app.route('/word', methods=['GET'])
@app.route('/word/<string:word>', methods=['GET'])
def get_word(word=None):
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()

        if word:
            query = "SELECT word FROM words WHERE word = ? LIMIT 1"  # Revisa el nombre correcto de la tabla
            cursor.execute(query, (word,))
        else:
            query = """SELECT word FROM words WHERE word NOT LIKE '% %' AND word NOT LIKE '% %' AND word NOT LIKE '%-%' AND word NOT LIKE "%'%" AND word GLOB '[A-Za-z]*' ORDER BY RANDOM() LIMIT 1"""
            cursor.execute(query)

        result = cursor.fetchone()
        if not result:
            return jsonify({"error": "Word not found"}), 404

        word = result[0]
        audio_path = os.path.join(AUDIO_FOLDER, f"{word}.mp3")

        # Generar audio si no existe
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

# Ruta para servir archivos de audio
@app.route('/audio/<string:filename>', methods=['GET'])
def serve_audio(filename):
    return send_from_directory(AUDIO_FOLDER, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
