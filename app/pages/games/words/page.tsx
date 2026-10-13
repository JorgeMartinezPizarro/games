'use client';

import { useMemo, useState } from "react";
import { Button } from "@mui/material";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import GameShell from "@/app/components/GameShell";
import Leaderboard from "@/app/components/Leaderboard";
import ResultPanel from "@/app/components/ResultPanel";
import { GameIntro, RankBadge } from "@/app/components/ui";
import {
  AnswerGrid,
  ListenOrb,
  RoundProgress,
  type AnswerState,
  type SegmentState,
} from "@/app/components/words/WordsParts";
import styles from "@/app/components/words/Words.module.css";
import { useAudioPlaying } from "@/app/hooks/useAudioPlaying";
import { ROUNDS_TOTAL, useWordsGame } from "@/app/hooks/useWordsGame";
import { useWordsKeyboard } from "@/app/hooks/useWordsKeyboard";
import { formatMs, useWordsScore, type WordsScoreEntry } from "@/app/hooks/useWordsScore";
import { useUser } from "@/app/hooks/useUser";

const Wording = () => {
  const [showScores, setShowScores] = useState(false);
  const { user } = useUser();

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
    finishedTotal,
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

  const playing = gameState === "playing" && Boolean(round);
  const audioPlaying = useAudioPlaying(audioRef, round?.audio);
  const locked = Boolean(feedback) || checking;

  useWordsKeyboard({
    enabled: playing && !locked,
    choices: round?.choices ?? [],
    onChoice: handleChoice,
    onReplay: handleReplay,
  });

  // Mayor score es mejor (cubo de aciertos entre tiempo), igual que numbers.
  const sortedScores = useMemo(
    () => [...score.topScores].sort((a, b) => b.score - a.score),
    [score.topScores]
  );

  const segments: SegmentState[] = Array.from({ length: ROUNDS_TOTAL }, (_, i) => {
    if (gameState === "finished" && won) return "ok";
    if (i < currentRound) return "ok";
    if (i > currentRound) return "todo";
    if (feedback === "correct") return "ok";
    if (feedback === "wrong" || (gameState === "finished" && !quit)) return "bad";
    return gameState === "playing" ? "now" : "todo";
  });

  const answerStates: AnswerState[] = (round?.choices ?? []).map((choice) => {
    if (feedback === "correct") return choice === pickedChoice ? "correct" : "dim";
    if (feedback === "wrong") {
      if (choice === pickedChoice) return "wrong";
      return choice === revealedTarget ? "reveal" : "dim";
    }
    return "idle";
  });

  const newGame = () => {
    setShowScores(false);
    startGame();
  };

  const result = won
    ? { tone: "win" as const, title: "¡Completado!", subtitle: "Diez de diez sin fallar." }
    : quit
    ? { tone: "neutral" as const, title: "Partida terminada", subtitle: "Las partidas abandonadas no puntúan." }
    : { tone: "lose" as const, title: "Game over", subtitle: `Fallaste en la ronda ${currentRound + 1}.` };

  return (
    <GameShell
      game="words"
      actions={
        <Button variant="outlined" onClick={() => setShowScores((v) => !v)} startIcon={<EmojiEventsOutlined />}>
          {showScores ? "Volver" : "Ranking"}
        </Button>
      }
    >
      {/* El <audio> vive fuera de las vistas para que el ranking no corte la ronda. */}
      {round && (
        <audio ref={audioRef} key={round.audio}>
          <source src={round.audio} type="audio/mpeg" />
        </audio>
      )}

      {showScores ? (
        <Leaderboard<WordsScoreEntry>
          testId="leaderboard"
          title="Ranking"
          subtitle="Aciertos³ entre el tiempo"
          rows={sortedScores}
          userOf={(entry) => entry.userId}
          currentUserId={user.id}
          columns={[
            { label: "Puntos", value: (entry) => entry.score, align: "right", strong: true },
            { label: "Aciertos", value: (entry) => `${entry.correctAnswers}/${entry.wordsTotal}`, align: "right" },
          ]}
        />
      ) : gameState === "idle" ? (
        <GameIntro
          game="words"
          title="Palabras"
          actions={
            <Button variant="contained" size="large" onClick={startGame} startIcon={<PlayArrowRounded />}>
              Jugar
            </Button>
          }
        >
          Escucha cada palabra y elige la correcta entre cuatro. Diez rondas: un fallo termina la partida.
          Puntúan los aciertos y la rapidez.
        </GameIntro>
      ) : gameState === "loading" ? (
        <div className={styles.center}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
            Preparando las palabras…
          </div>
        </div>
      ) : (
        <div className={styles.play}>
          <div className={styles.stats}>
            <span>
              Ronda <b className="num">{Math.min(currentRound + 1, ROUNDS_TOTAL)}</b>/{ROUNDS_TOTAL}
            </span>
            <span className={`num ${styles.time}`}>
              {formatMs(gameState === "finished" && finishedTime !== null ? finishedTime : elapsedMs)}
            </span>
            <span>
              Aciertos <b className="num">{correctCount}</b>
            </span>
          </div>
          <RoundProgress segments={segments} />

          {playing && round ? (
            <>
              <ListenOrb playing={audioPlaying} onReplay={handleReplay} />
              <p className={`${styles.hint} ${styles.hintTouch}`}>Toca el círculo para volver a escuchar</p>
              <p className={`${styles.hint} ${styles.hintKeys}`}>
                Pulsa el círculo o <kbd>espacio</kbd> para volver a escuchar · responde con <kbd>1</kbd>–<kbd>4</kbd>
              </p>
              <AnswerGrid choices={round.choices} states={answerStates} disabled={locked} onChoice={handleChoice} />
              <div className={styles.footer}>
                <Button variant="text" onClick={handleQuit} startIcon={<FlagOutlined />}>
                  Terminar partida
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.center}>
              <ResultPanel
                tone={result.tone}
                title={result.title}
                subtitle={result.subtitle}
                stats={[
                  { label: "Tiempo", value: finishedTime !== null ? formatMs(finishedTime) : "—" },
                  { label: "Aciertos", value: `${correctCount}/${ROUNDS_TOTAL}` },
                  ...(finishedScore !== null ? [{ label: "Puntos", value: finishedScore }] : []),
                ]}
                footer={!quit && <RankBadge rank={finishedRank} total={finishedTotal} />}
                actions={
                  <>
                    <Button variant="contained" onClick={newGame} startIcon={<ReplayRounded />}>
                      Jugar otra vez
                    </Button>
                    <Button variant="outlined" onClick={() => setShowScores(true)}>
                      Ver ranking
                    </Button>
                  </>
                }
              />
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
};

export default Wording;
