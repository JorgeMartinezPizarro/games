'use client';

import MainMenu from "@/app/components/MainMenu";
import { TextField, Button } from "@mui/material";
import { useCallback, useEffect, useState, useRef } from "react";
import "./styles.css";

const WORDS_TOTAL = 10;

type ScoreEntry = {
  score: number;
  name: string;
  wordsTotal: number;
  createdAt?: string;
};

type AudioResponse = {
  word: string;
  url: string;
};

const Wording = () => {
  const [word, setWord] = useState("");
  const [audioUrl, setAudioUrl] = useState<string>("");

  const [score, setScore] = useState(0);
  const [text, setText] = useState("");
  const [showWord, setShowWord] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [showScores, setShowScores] = useState(true);
  const [topScores, setTopScores] = useState<ScoreEntry[]>([]);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [finished, setFinished] = useState(false);

  const [finishedTime, setFinishedTime] = useState<number | null>(null);
  const [finishedRank, setFinishedRank] = useState<number | null>(null);

  const startTimeRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadScores = useCallback(async (): Promise<ScoreEntry[]> => {
    try {
      const response = await fetch("/bookmarks/api/scores?gameId=4");
      const data = await response.json();

      if (data.scores) {
        const mapped: ScoreEntry[] = data.scores.map((s: any) => ({
          score: s.score,
          name: s.username,
          wordsTotal: s.gameConfig?.wordsTotal || WORDS_TOTAL,
          createdAt: s.createdAt,
        }));
        setTopScores(mapped);
        return mapped;
      }
    } catch (error) {
      console.error("Error loading scores:", error);
    }
    return [];
  }, []);

  const requestAudioWord = useCallback(async () => {
    if (!playing) {
      setWord("");
      setAudioUrl("");
      return;
    }

    const res = await fetch("/bookmarks/api/audio");
    const data: AudioResponse = await res.json();

    setWord(data.word);
    setAudioUrl(data.url);
  }, [playing]);

  const saveScore = useCallback(async () => {
    if (scoreSaved) return;

    const elapsed = Date.now() - startTimeRef.current;
    setFinishedTime(elapsed);

    try {
      const response = await fetch("/bookmarks/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: 4,
          username: "player",
          score: elapsed,
          gameConfig: { wordsTotal: WORDS_TOTAL }
        }),
      });

      if (response.ok) {
        setScoreSaved(true);
        const updated = await loadScores();

        const sorted = [...updated].sort((a, b) => a.score - b.score);
        const idx = sorted.findIndex((s) => s.score === elapsed);
        setFinishedRank(idx >= 0 && idx < 10 ? idx + 1 : null);

        setShowScores(false);
      }
    } catch (error) {
      console.error("Error saving score:", error);
    }
  }, [scoreSaved, loadScores]);

  const saveScoreRef = useRef(saveScore);

  useEffect(() => {
    saveScoreRef.current = saveScore;
  }, [saveScore]);

  // RESET PARTIDA + arranque/parada del cronómetro
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (playing) {
      setScore(0);
      setScoreSaved(false);
      setFinished(false);
      setFinishedTime(null);
      setFinishedRank(null);

      startTimeRef.current = Date.now();
      setElapsedMs(0);

      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing]);

  // Foco automático
  useEffect(() => {
    if (playing) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [playing]);

  // nueva palabra
  useEffect(() => {
    requestAudioWord();
  }, [requestAudioWord]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  // autoplay audio cuando cambia
  useEffect(() => {
    if (playing) {
      audioRef.current?.play().catch((e) => console.warn("No se pudo autoreproducir:", e));
    }
  }, [audioUrl, playing]);

  // Volver a escuchar el audio actual
  const handleReplayAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch((e) => console.warn("No se pudo reproducir el audio:", e));
  }, []);

  const handleSubmitWord = () => {
    if (text === word && playing) {
      const next = score + 1;

      setScore(next);
      setText("");

      if (next >= WORDS_TOTAL) {
        setPlaying(false);
        setFinished(true);
        saveScoreRef.current();
        return;
      }

      requestAudioWord();
    }
  };

  const sortedScores = [...topScores]
    .sort((a, b) => a.score - b.score)
    .slice(0, 10);

  return (
    <div className="wording-page">
      <MainMenu />

      <Button
        className="toggle-view-btn"
        variant="contained"
        onClick={() => setShowScores(!showScores)}
      >
        {showScores ? "Ver Puntuaciones" : "Jugar"}
      </Button>

      {showScores ? (
        <div className="panel">
          <h2 className="panel-title">
            {!playing && finished
              ? "🎉 Partida finalizada"
              : !playing
              ? "👋 Bienvenido"
              : showWord
              ? word
              : "Oculta"}
          </h2>

          {playing && (
            <TextField
              inputRef={inputRef}
              color={word === text ? "primary" : "error"}
              onKeyDown={(event) => {
                if (event.key === "Enter" && text === word) {
                  handleSubmitWord();
                }
              }}
              className="word-input"
              value={text}
              onChange={(e: any) => setText(e.target.value)}
              placeholder="Escribe la palabra aquí..."
            />
          )}

          <div className="button-row">
            <Button
              className={`action-btn ${playing ? "action-btn--play" : "action-btn--stopped"}`}
              variant="contained"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? "DETENER" : "JUGAR"}
            </Button>

            <Button
              className="action-btn action-btn--neutral"
              variant="contained"
              onClick={() => setShowWord(!showWord)}
            >
              {!showWord ? "MOSTRAR" : "OCULTAR"}
            </Button>

            <Button
              className="action-btn action-btn--submit"
              variant="contained"
              onClick={handleSubmitWord}
              disabled={!playing}
            >
              ✓
            </Button>
          </div>

          <div className="button-row">
            <Button
              className="action-btn action-btn--replay"
              variant="outlined"
              onClick={handleReplayAudio}
              disabled={!playing || !audioUrl}
            >
              🔁 Escuchar de nuevo
            </Button>
          </div>

          <p className="stats-line">
            Palabras: <strong>{score}</strong> / {WORDS_TOTAL} | Tiempo:{" "}
            <strong>{elapsedMs} ms</strong>
          </p>

          {audioUrl !== "" && (
            <audio ref={audioRef} key={audioUrl} className="hidden-audio">
              <source src={audioUrl} type="audio/mpeg" />
            </audio>
          )}
        </div>
      ) : (
        <div className="scoreboard-panel">
          <h3 className="scoreboard-title">Mejores Tiempos</h3>

          {finished && finishedTime !== null && (
            <div className="finished-summary">
              <div className="finished-summary__time">
                ⏱ Tu tiempo: {finishedTime} ms
              </div>
              {finishedRank !== null ? (
                <p className="finished-summary__rank">
                  🏆 ¡Puesto #{finishedRank} del top 10!
                </p>
              ) : (
                <p className="finished-summary__rank finished-summary__rank--outside">
                  No has entrado en el top 10 esta vez.
                </p>
              )}
            </div>
          )}

          <div className="scoreboard-table-wrapper">
            {sortedScores.length === 0 ? (
              <p className="no-scores">No hay puntuaciones aún</p>
            ) : (
              <table className="scoreboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Usuario</th>
                    <th>Tiempo (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedScores.map((s, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{s.name}</td>
                      <td>{s.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Wording;