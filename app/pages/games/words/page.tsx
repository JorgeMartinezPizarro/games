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

  // Higher is better (correct answers cubed divided by time), same as numbers.
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
    ? { tone: "win" as const, title: "Completed!", subtitle: "Ten out of ten, no mistakes." }
    : quit
    ? { tone: "neutral" as const, title: "Game ended", subtitle: "Abandoned games don't score." }
    : { tone: "lose" as const, title: "Game over", subtitle: `You missed round ${currentRound + 1}.` };

  return (
    <GameShell
      game="words"
      actions={
        <Button variant="outlined" onClick={() => setShowScores((v) => !v)} startIcon={<EmojiEventsOutlined />}>
          {showScores ? "Back" : "Leaderboard"}
        </Button>
      }
    >
      {/* The <audio> lives outside the views so opening the leaderboard does not cut the round. */}
      {round && (
        <audio ref={audioRef} key={round.audio}>
          <source src={round.audio} type="audio/mpeg" />
        </audio>
      )}

      {showScores ? (
        <Leaderboard<WordsScoreEntry>
          testId="leaderboard"
          title="Leaderboard"
          subtitle="Correct answers³ divided by time"
          rows={sortedScores}
          userOf={(entry) => entry.userId}
          currentUserId={user.id}
          columns={[
            { label: "Points", value: (entry) => entry.score, align: "right", strong: true },
            { label: "Correct", value: (entry) => `${entry.correctAnswers}/${entry.wordsTotal}`, align: "right" },
          ]}
        />
      ) : gameState === "idle" ? (
        <GameIntro
          game="words"
          title="Words"
          actions={
            <Button variant="contained" size="large" onClick={startGame} startIcon={<PlayArrowRounded />}>
              Play
            </Button>
          }
        >
          Listen to each word and pick the right one out of four. Ten rounds: one mistake ends the game.
          Your score depends on correct answers and speed.
        </GameIntro>
      ) : gameState === "loading" ? (
        <div className={styles.center}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
            Preparing the words…
          </div>
        </div>
      ) : (
        <div className={styles.play}>
          <div className={styles.stats}>
            <span>
              Round <b className="num">{Math.min(currentRound + 1, ROUNDS_TOTAL)}</b>/{ROUNDS_TOTAL}
            </span>
            <span className={`num ${styles.time}`}>
              {formatMs(gameState === "finished" && finishedTime !== null ? finishedTime : elapsedMs)}
            </span>
            <span>
              Correct <b className="num">{correctCount}</b>
            </span>
          </div>
          <RoundProgress segments={segments} />

          {playing && round ? (
            <>
              <ListenOrb playing={audioPlaying} onReplay={handleReplay} />
              <p className={`${styles.hint} ${styles.hintTouch}`}>Tap the circle to listen again</p>
              <p className={`${styles.hint} ${styles.hintKeys}`}>
                Click the circle or press <kbd>space</kbd> to listen again · answer with <kbd>1</kbd>–<kbd>4</kbd>
              </p>
              <AnswerGrid choices={round.choices} states={answerStates} disabled={locked} onChoice={handleChoice} />
              <div className={styles.footer}>
                <Button variant="text" onClick={handleQuit} startIcon={<FlagOutlined />}>
                  End game
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
                  { label: "Time", value: finishedTime !== null ? formatMs(finishedTime) : "—" },
                  { label: "Correct", value: `${correctCount}/${ROUNDS_TOTAL}` },
                  ...(finishedScore !== null ? [{ label: "Points", value: finishedScore }] : []),
                ]}
                footer={!quit && <RankBadge rank={finishedRank} total={finishedTotal} />}
                actions={
                  <>
                    <Button variant="contained" onClick={newGame} startIcon={<ReplayRounded />}>
                      Play again
                    </Button>
                    <Button variant="outlined" onClick={() => setShowScores(true)}>
                      View leaderboard
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
