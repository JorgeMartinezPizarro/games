'use client';

import MainMenu from "@/app/components/MainMenu";
import { Button } from "@mui/material";
import { useCallback, useEffect, useState, useRef } from "react";
import "./styles.css";

const ROUNDS_TOTAL = 10;
const CHOICES      = 4;

// El backend nunca manda el target: solo audio + choices. La corrección de
// cada ronda se valida en /api/words/answer, de una en una y de un solo uso.
type Round = {
  audio:   string;
  choices: string[];
};

type ScoreEntry = {
  score:      number;
  name:       string;
  wordsTotal: number;
  createdAt?: string;
};

type GameState = 'idle' | 'loading' | 'playing' | 'finished';

// Precarga un audio en el navegador (no solo en el servidor) para que la
// primera reproducción de cada ronda sea instantánea. No bloquea el juego
// indefinidamente si un archivo tarda o falla.
function preloadAudio(url: string, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('canplaythrough', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    audio.src = url;
    audio.load();
    setTimeout(done, timeoutMs);
  });
}

const Wording = () => {
  const [gameState, setGameState]       = useState<GameState>('idle');
  const [rounds, setRounds]             = useState<Round[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore]               = useState(0);
  const [won, setWon]                   = useState(false);  // true = completó las 10
  const [showScores, setShowScores]     = useState(false);
  const [topScores, setTopScores]       = useState<ScoreEntry[]>([]);
  const [scoreSaved, setScoreSaved]     = useState(false);
  const [finishedTime, setFinishedTime] = useState<number | null>(null);
  const [finishedRank, setFinishedRank] = useState<number | null>(null);
  const [feedback, setFeedback]         = useState<'correct' | 'wrong' | null>(null);
  const [pickedChoice, setPickedChoice] = useState<string | null>(null);
  const [revealedTarget, setRevealedTarget] = useState<string | null>(null);
  const [checking, setChecking]         = useState(false);
  const [nonce, setNonce]               = useState<string | null>(null);

  const startTimeRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs]       = useState(0);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef     = useRef<HTMLAudioElement | null>(null);

  // Cronómetro
  useEffect(() => {
    if (gameState === 'playing') {
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
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState]);

  // Autoplay cuando cambia la ronda
  useEffect(() => {
    if (gameState === 'playing' && rounds[currentRound]) {
      setTimeout(() => {
        audioRef.current?.play().catch(e => console.warn('autoplay blocked:', e));
      }, 80);
    }
  }, [currentRound, gameState, rounds]);

  // Scores
  const loadScores = useCallback(async (): Promise<ScoreEntry[]> => {
    try {
      const res  = await fetch('/bookmarks/api/scores?gameId=4');
      const data = await res.json();
      if (data.scores) {
        const mapped: ScoreEntry[] = data.scores.map((s: any) => ({
          score:      s.score,
          name:       s.username,
          wordsTotal: s.gameConfig?.wordsTotal ?? ROUNDS_TOTAL,
          createdAt:  s.createdAt,
        }));
        setTopScores(mapped);
        return mapped;
      }
    } catch (e) {
      console.error('Error loading scores:', e);
    }
    return [];
  }, []);

  useEffect(() => { loadScores(); }, [loadScores]);

  // El score final lo calcula siempre el backend (nonce creado en
  // /api/words/new-game, cada ronda validada en /api/words/answer): esto
  // solo confirma la partida y adopta el tiempo que devuelve el servidor.
  const saveScore = useCallback(async (nonceValue: string) => {
    if (scoreSaved) return;
    try {
      const res = await fetch('/bookmarks/api/scores', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: 4, nonce: nonceValue }),
      });
      const data = await res.json();
      if (res.ok) {
        setScoreSaved(true);
        const updated = await loadScores();
        const confirmedScore = typeof data.score === 'number' ? data.score : null;

        if (confirmedScore !== null) {
          setFinishedTime(confirmedScore);
          const sorted = [...updated].sort((a, b) => a.score - b.score);
          const idx    = sorted.findIndex(s => s.score === confirmedScore);
          setFinishedRank(idx >= 0 && idx < 10 ? idx + 1 : null);
        }
      }
    } catch (e) {
      console.error('Error saving score:', e);
    }
  }, [scoreSaved, loadScores]);

  // Iniciar partida
  const startGame = useCallback(async () => {
    setGameState('loading');
    setScore(0);
    setWon(false);
    setCurrentRound(0);
    setScoreSaved(false);
    setFinishedTime(null);
    setFinishedRank(null);
    setFeedback(null);
    setPickedChoice(null);
    setRevealedTarget(null);
    setNonce(null);

    try {
      const res  = await fetch(
        `/bookmarks/api/words/new-game?rounds=${ROUNDS_TOTAL}&choices=${CHOICES}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok || !data.rounds?.length) throw new Error('No rounds received');

      // El cronómetro arranca en cuanto el servidor crea la partida (mismo
      // instante que usará para calcular el tiempo final), no cuando
      // termina de precargarse el audio.
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      setNonce(data.nonce);
      setRounds(data.rounds);

      // Precachea los 10 audios en el navegador mientras se ve la pantalla
      // de carga, para que no haya que esperar red al reproducir cada ronda.
      await Promise.all((data.rounds as Round[]).map(r => preloadAudio(r.audio)));

      setGameState('playing');
    } catch (e) {
      console.error('Error loading challenge:', e);
      setGameState('idle');
    }
  }, []);

  // El jugador elige una palabra: se valida contra el backend, de una ronda
  // en una y de un solo intento (un fallo termina la partida ahí mismo).
  const handleChoice = useCallback(async (choice: string) => {
    if (gameState !== 'playing' || feedback || checking || !nonce) return;

    setChecking(true);
    setPickedChoice(choice);

    try {
      const res = await fetch('/bookmarks/api/words/answer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce, roundIndex: currentRound, answer: choice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Answer check failed');

      setChecking(false);

      if (!data.correct) {
        setRevealedTarget(typeof data.target === 'string' ? data.target : null);
        setFeedback('wrong');

        setTimeout(() => {
          setFeedback(null);
          const elapsed = Date.now() - startTimeRef.current;
          setFinishedTime(elapsed);
          setWon(false);
          setGameState('finished');
        }, 500);
        return;
      }

      setFeedback('correct');

      setTimeout(() => {
        setFeedback(null);
        setScore(s => s + 1);

        if (data.finished) {
          const elapsed = Date.now() - startTimeRef.current;
          setFinishedTime(elapsed);
          setWon(true);
          setGameState('finished');
          saveScore(nonce);
        } else {
          setCurrentRound(c => c + 1);
        }
      }, 500);
    } catch (e) {
      console.error('Error checking answer:', e);
      setChecking(false);
    }
  }, [gameState, feedback, checking, nonce, currentRound, saveScore]);

  // Replay audio
  const handleReplay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(e => console.warn('replay failed:', e));
  }, []);

  const sortedScores = [...topScores].sort((a, b) => a.score - b.score).slice(0, 10);
  const round        = rounds[currentRound];

  const formatMs = (ms: number) =>
    ms < 60000
      ? `${(ms / 1000).toFixed(3)}s`
      : `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(3)}s`;

  return (
    <div className="wording-page">
      <MainMenu />

      <div className="wording-header">
        <Button
          className="toggle-view-btn"
          variant="contained"
          onClick={() => setShowScores(s => !s)}
        >
          {showScores ? '🎮 Jugar' : '🏆 Puntuaciones'}
        </Button>
      </div>

      {!showScores && (
        <div className="panel">

          {/* IDLE */}
          {gameState === 'idle' && (
            <>
              <h2 className="panel-title">👂 Wording</h2>
              <p className="panel-subtitle">
                Escucha la palabra y selecciona la correcta entre las opciones.
              </p>
              <Button className="action-btn action-btn--play" variant="contained" onClick={startGame}>
                JUGAR
              </Button>
            </>
          )}

          {/* LOADING */}
          {gameState === 'loading' && (
            <>
              <h2 className="panel-title">Cargando partida…</h2>
              <div className="loading-spinner" />
            </>
          )}

          {/* PLAYING */}
          {gameState === 'playing' && round && (
            <>
              <p className="round-counter">
                Ronda <strong>{currentRound + 1}</strong> / {ROUNDS_TOTAL}
              </p>

              <p className="stats-line">
                ⏱ {formatMs(elapsedMs)} &nbsp;|&nbsp; ✅ {score}
              </p>

              <audio ref={audioRef} key={round.audio}>
                <source src={round.audio} type="audio/mpeg" />
              </audio>

              <Button
                className="action-btn action-btn--replay"
                variant="outlined"
                onClick={handleReplay}
              >
                🔁 Escuchar de nuevo
              </Button>

              <div className={`choices-grid choices-grid--${CHOICES}`}>
                {round.choices.map((choice) => {
                  let cls = 'choice-btn';
                  if (feedback === 'correct' && choice === pickedChoice) cls += ' choice-btn--correct';
                  if (feedback === 'wrong'   && choice === revealedTarget) cls += ' choice-btn--reveal';
                  if (feedback === 'wrong'   && choice !== revealedTarget) cls += ' choice-btn--wrong';

                  return (
                    <Button
                      key={choice}
                      className={cls}
                      variant="contained"
                      disabled={!!feedback || checking}
                      onClick={() => handleChoice(choice)}
                    >
                      {choice}
                    </Button>
                  );
                })}
              </div>
            </>
          )}

          {/* FINISHED */}
          {gameState === 'finished' && (
            <>
              <h2 className="panel-title">
                {won ? '🎉 ¡Completado!' : '💀 Game Over'}
              </h2>

              <div className="finished-summary">
                <div className="finished-summary__time">
                  ⏱ Tiempo: <strong>{finishedTime !== null ? formatMs(finishedTime) : '—'}</strong>
                </div>
                <div className="finished-summary__time">
                  ✅ Aciertos: <strong>{score} / {ROUNDS_TOTAL}</strong>
                </div>

                {won ? (
                  finishedRank !== null ? (
                    <p className="finished-summary__rank">
                      🏆 ¡Puesto #{finishedRank} del top 10!
                    </p>
                  ) : (
                    <p className="finished-summary__rank finished-summary__rank--outside">
                      No has entrado en el top 10 esta vez.
                    </p>
                  )
                ) : (
                  <p className="finished-summary__rank finished-summary__rank--outside">
                    Fallaste en la ronda {currentRound + 1}. ¡Inténtalo de nuevo!
                  </p>
                )}
              </div>

              <div className="button-row">
                <Button className="action-btn action-btn--play" variant="contained" onClick={startGame}>
                  🔄 Nueva partida
                </Button>
                <Button
                  className="action-btn action-btn--neutral"
                  variant="outlined"
                  onClick={() => setShowScores(true)}
                >
                  🏆 Ver puntuaciones
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* VISTA SCORES */}
      {showScores && (
        <div className="scoreboard-panel">
          <h3 className="scoreboard-title">🏆 Mejores Tiempos</h3>

          {gameState === 'finished' && won && finishedTime !== null && (
            <div className="finished-summary">
              <div className="finished-summary__time">
                ⏱ Tu tiempo: {formatMs(finishedTime)}
              </div>
              {finishedRank !== null ? (
                <p className="finished-summary__rank">🏆 ¡Puesto #{finishedRank} del top 10!</p>
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
                    <th>Tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedScores.map((s, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{s.name}</td>
                      <td>{formatMs(s.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <Button
            className="action-btn action-btn--play"
            variant="contained"
            onClick={() => { setShowScores(false); startGame(); }}
            style={{ marginTop: '1.5rem' }}
          >
            🎮 Jugar
          </Button>
        </div>
      )}
    </div>
  );
};

export default Wording;
