from flask import Flask, request, jsonify
import subprocess
import threading

app = Flask(__name__)

STOCKFISH_PATH = "/usr/local/bin/stockfish"

# Global Stockfish process
stockfish_process = None
stockfish_lock = threading.Lock()

def initialize_stockfish():
    global stockfish_process
    stockfish_process = subprocess.Popen(
        [STOCKFISH_PATH],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    # Send the initial UCI command
    stockfish_process.stdin.write("uci\n")
    stockfish_process.stdin.flush()

    # Read the initial output
    while True:
        line = stockfish_process.stdout.readline().strip()
        if line == "uciok":
            break

@app.route("/chess", methods=["POST"])
def chess():
    global stockfish_process
    try:
        # Read the payload
        payload = request.data.decode().strip()
        if not payload:
            return jsonify({"error": "Empty payload"}), 400

        print("Payload received:", payload)

        with stockfish_lock:
            # Send the command to Stockfish
            stockfish_process.stdin.write(f"{payload}\n")
            stockfish_process.stdin.flush()

            # Read the response line by line
            response_lines = []
            while True:
                line = stockfish_process.stdout.readline().strip()
                response_lines.append(line)
                if line.startswith("bestmove"):
                    break

        print("Stockfish response:\n", response_lines)
        return jsonify({"response": response_lines}), 200

    except Exception as e:
        print("Flask API error:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    initialize_stockfish()
    app.run(host="0.0.0.0", port=8080)
