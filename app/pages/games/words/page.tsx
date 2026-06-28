'use client';

import MainMenu from "@/app/components/MainMenu";
import { Button } from "@mui/material";
import { useCallback, useEffect, useState, useRef } from "react";
import "./styles.css";

const ROUNDS_TOTAL = 10;
const CHOICES      = 4;

type Round = {
  target:  string;
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

  const saveScore = useCallback(async (elapsed: number, finalScore: number) => {
    if (scoreSaved) return;
    try {
      const res = await fetch('/bookmarks/api/scores', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId:     4,
          score:      elapsed,
          gameConfig: { wordsTotal: ROUNDS_TOTAL, correctAnswers: finalScore },
        }),
      });
      if (res.ok) {
        setScoreSaved(true);
        const updated = await loadScores();
        const sorted  = [...updated].sort((a, b) => a.score - b.score);
        const idx     = sorted.findIndex(s => s.score === elapsed);
        setFinishedRank(idx >= 0 && idx < 10 ? idx + 1 : null);
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

    try {
      const res  = await fetch(`/bookmarks/api/audio?rounds=${ROUNDS_TOTAL}&choices=${CHOICES}`);
      const data = await res.json();
      if (!data.rounds?.length) throw new Error('No rounds received');

      setRounds(data.rounds);
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      setGameState('playing');
    } catch (e) {
      console.error('Error loading challenge:', e);
      setGameState('idle');
    }
  }, []);

  // El jugador elige una palabra
  const handleChoice = useCallback((choice: string) => {
    if (gameState !== 'playing' || feedback) return;

    const round    = rounds[currentRound];
    const correct  = choice === round.target;
    const newScore = correct ? score + 1 : score;

    setFeedback(correct ? 'correct' : 'wrong');

    setTimeout(() => {
      setFeedback(null);

      if (!correct) {
        // Fallo → game over sin guardar score
        const elapsed = Date.now() - startTimeRef.current;
        setFinishedTime(elapsed);
        setWon(false);
        setScore(newScore);
        setGameState('finished');
        return;
      }

      setScore(newScore);
      const next = currentRound + 1;

      if (next >= ROUNDS_TOTAL) {
        // Completó las 10 → guardar score
        const elapsed = Date.now() - startTimeRef.current;
        setFinishedTime(elapsed);
        setWon(true);
        setGameState('finished');
        saveScore(elapsed, newScore);
      } else {
        setCurrentRound(next);
      }
    }, 500);
  }, [gameState, feedback, rounds, currentRound, score, saveScore]);

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
      ? `${(ms / 1000).toFixed(1)}s`
      : `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(1)}s`;

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
                  if (feedback === 'correct' && choice === round.target) cls += ' choice-btn--correct';
                  if (feedback === 'wrong'   && choice === round.target) cls += ' choice-btn--reveal';
                  if (feedback === 'wrong'   && choice !== round.target) cls += ' choice-btn--wrong';

                  return (
                    <Button
                      key={choice}
                      className={cls}
                      variant="contained"
                      disabled={!!feedback}
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