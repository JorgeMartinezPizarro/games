"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@mui/material";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import PauseRounded from "@mui/icons-material/PauseRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import GameShell from "@/app/components/GameShell";
import Leaderboard from "@/app/components/Leaderboard";
import ResultPanel from "@/app/components/ResultPanel";
import { RankBadge, StatTile, uiStyles } from "@/app/components/ui";
import { NextPiece, TetrisBoard } from "@/app/components/tetris/TetrisBoard";
import { KeyHints, TouchControls } from "@/app/components/tetris/TetrisControls";
import styles from "@/app/components/tetris/Tetris.module.css";
import { useFlashOnIncrease } from "@/app/hooks/useFlashOnIncrease";
import { useTetris } from "@/app/hooks/useTetris";
import { formatTimeMs, type LeaderboardEntry, useScore } from "@/app/hooks/useTetrisScore";
import { useUser } from "@/app/hooks/useUser";

const Tetris: React.FC = () => {
  const [showScores, setShowScores] = useState(false);
  const { user } = useUser();
  const score = useScore();
  const tetris = useTetris({ onComplete: score.saveScore });

  const {
    board,
    piece,
    nextPiece,
    pos,
    lines,
    linesTarget,
    elapsedMs,
    gameCompleted,
    gameOver,
    lockVisual,
    lockBoard,
    ready,
    loading,
    moveLeft,
    moveRight,
    softDrop,
    rotateLeft,
    rotateRight,
    startGame,
    stopGame,
    startRepeat,
    stopRepeat,
  } = tetris;

  const isActive = ready && !gameCompleted && !gameOver;
  const flash = useFlashOnIncrease(lines);
  const shownLines = Math.min(lines, linesTarget);

  const play = useCallback(() => {
    setShowScores(false);
    score.resetSaveGuard();
    startGame();
  }, [score, startGame]);

  const sortedScores = useMemo(
    () => [...score.topScores].sort((a, b) => a.timeMs - b.timeMs),
    [score.topScores]
  );
  const mineTimeMs =
    score.lastResult?.rank != null && score.lastResult.rank <= 10 ? score.lastResult.timeMs : null;

  // What is drawn over the board when no game is running.
  let overlay: React.ReactNode = null;
  if (loading) {
    overlay = <p className={styles.intro}>Preparing the game…</p>;
  } else if (gameCompleted) {
    overlay = (
      <ResultPanel
        tone="win"
        title="Completed!"
        subtitle={`${linesTarget} lines cleared.`}
        stats={[{ label: "Time", value: formatTimeMs(elapsedMs) }]}
        footer={
          score.lastResult?.rank != null && (
            <RankBadge rank={score.lastResult.rank} total={score.lastResult.total ?? null} />
          )
        }
        actions={
          <>
            <Button variant="contained" onClick={play} startIcon={<ReplayRounded />}>
              Play again
            </Button>
            <Button variant="outlined" onClick={() => setShowScores(true)}>
              View leaderboard
            </Button>
          </>
        }
      />
    );
  } else if (gameOver) {
    overlay = (
      <ResultPanel
        tone="lose"
        title="Game over"
        subtitle={`You had ${shownLines} of ${linesTarget} lines.`}
        actions={
          <Button variant="contained" onClick={play} startIcon={<ReplayRounded />}>
            Play again
          </Button>
        }
      />
    );
  } else if (!ready) {
    overlay = (
      <div className={styles.intro}>
        <h2>Tetris</h2>
        <p>Clear {linesTarget} lines as fast as you can. The clock starts with the first piece.</p>
        <Button variant="contained" size="large" onClick={play} startIcon={<PlayArrowRounded />}>
          Play
        </Button>
      </div>
    );
  }

  return (
    <GameShell
      game="tetris"
      actions={
        isActive ? (
          <Button variant="outlined" onClick={stopGame} startIcon={<PauseRounded />}>
            Stop
          </Button>
        ) : (
          <Button variant="outlined" onClick={() => setShowScores((v) => !v)} startIcon={<EmojiEventsOutlined />}>
            {showScores ? "Back" : "Leaderboard"}
          </Button>
        )
      }
    >
      {showScores ? (
        <Leaderboard<LeaderboardEntry>
          title="Leaderboard"
          subtitle={`Best time for ${linesTarget} lines`}
          rows={sortedScores}
          userOf={(entry) => entry.userId}
          currentUserId={user.id}
          isRecord={(entry) => mineTimeMs !== null && entry.timeMs === mineTimeMs && entry.userId === user.id}
          columns={[
            { label: "Time", value: (entry) => formatTimeMs(entry.timeMs), align: "right", strong: true },
            { label: "Lines", value: (entry) => entry.linesTarget, align: "right" },
          ]}
        />
      ) : (
        <div className={styles.layout}>
          <div className={styles.areaLines}>
            <StatTile label="Lines" value={`${shownLines}/${linesTarget}`} testId="lines">
              <div className={styles.bar}>
                <i style={{ width: `${(shownLines / linesTarget) * 100}%` }} />
              </div>
            </StatTile>
          </div>
          <div className={styles.areaTime}>
            <StatTile label="Time" value={formatTimeMs(elapsedMs)} />
          </div>
          <div className={styles.areaNext}>
            <StatTile label="Next" value={<NextPiece piece={nextPiece} ready={isActive} />} />
          </div>
          <div className={`${styles.areaKeys} ${uiStyles.stat}`}>
            <span className={uiStyles.statLabel}>Controls</span>
            <KeyHints />
          </div>

          <div className={styles.areaBoard}>
            <TetrisBoard
              board={board}
              piece={piece}
              pos={pos}
              active={ready}
              lockVisual={lockVisual}
              lockBoard={lockBoard}
              flash={flash}
            >
              {overlay}
            </TetrisBoard>
          </div>

          <div className={styles.areaPads}>
            <TouchControls
              startRepeat={startRepeat}
              stopRepeat={stopRepeat}
              moveLeft={moveLeft}
              moveRight={moveRight}
              softDrop={softDrop}
              rotateLeft={rotateLeft}
              rotateRight={rotateRight}
            />
          </div>
        </div>
      )}
    </GameShell>
  );
};

export default Tetris;
