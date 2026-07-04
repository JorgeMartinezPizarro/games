'use client';

import MainMenu from "@/app/components/MainMenu";
import { Button } from "@mui/material";
import { useState } from "react";
import "./styles.css";
import { CHOICES, ROUNDS_TOTAL, useWordsGame } from "@/app/hooks/useWordsGame";
import { formatMs, useWordsScore } from "@/app/hooks/useWordsScore";

const Wording = () => {
  const [showScores, setShowScores] = useState(false);

  const score = useWordsScore();
  const game = useWordsGame({
    onComplete: score.saveScore,
    onReset: score.resetSaveGuard,
  });

  const {
    gameState,
    currentRound,
    score: correctCount,
    won,
    quit,
    finishedTime,
    finishedScore,
    finishedRank,
    feedback,
    pickedChoice,
    revealedTarget,
    checking,
    elapsedMs,
    audioRef,
    round,
    startGame,
    handleChoice,
    handleQuit,
    handleReplay,
  } = game;

  // Mayor score es mejor (cubo de aciertos entre tiempo), igual que numbers.
  const sortedScores = [...score.topScores].sort((a, b) => b.score - a.score).slice(0, 10);

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
                ⏱ {formatMs(elapsedMs)} &nbsp;|&nbsp; ✅ {correctCount}
              </p>

              <audio ref={audioRef} key={round.audio}>
                <source src={round.audio} type="audio/mpeg" />
              </audio>

              <div className="button-row">
                <Button
                  className="action-btn action-btn--replay"
                  variant="outlined"
                  onClick={handleReplay}
                >
                  🔁 Escuchar de nuevo
                </Button>
                <Button
                  className="action-btn action-btn--neutral"
                  variant="outlined"
                  onClick={handleQuit}
                >
                  🚩 Finalizar partida
                </Button>
              </div>

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
                  ✅ Aciertos: <strong>{correctCount} / {ROUNDS_TOTAL}</strong>
                </div>
                {finishedScore !== null && (
                  <div className="finished-summary__time">
                    🎯 Puntos: <strong>{finishedScore}</strong>
                  </div>
                )}

                {quit ? (
                  <p className="finished-summary__rank finished-summary__rank--outside">
                    Partida finalizada. ¡Inténtalo de nuevo!
                  </p>
                ) : (
                  <>
                    {!won && (
                      <p className="finished-summary__rank finished-summary__rank--outside">
                        Fallaste en la ronda {currentRound + 1}.
                      </p>
                    )}
                    {finishedRank !== null ? (
                      <p className="finished-summary__rank">
                        🏆 ¡Puesto #{finishedRank} del top 10!
                      </p>
                    ) : (
                      <p className="finished-summary__rank finished-summary__rank--outside">
                        No has entrado en el top 10 esta vez.
                      </p>
                    )}
                  </>
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
          <h3 className="scoreboard-title">🏆 Mejores Puntuaciones</h3>

          {gameState === 'finished' && !quit && finishedScore !== null && (
            <div className="finished-summary">
              <div className="finished-summary__time">
                🎯 Tu puntuación: {finishedScore}
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
                    <th>Puntos</th>
                    <th>Aciertos</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedScores.map((s, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{s.userId}</td>
                      <td>{s.score}</td>
                      <td>{s.correctAnswers} / {s.wordsTotal}</td>
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
