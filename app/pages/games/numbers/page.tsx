'use client'

import { useEffect, useMemo, useState } from "react";
import { Button } from "@mui/material";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import GameShell from "@/app/components/GameShell";
import Leaderboard from "@/app/components/Leaderboard";
import { GameIntro, Notice, RankBadge } from "@/app/components/ui";
import { NumbersBoard, StepsRing } from "@/app/components/numbers/NumbersBoard";
import styles from "@/app/components/numbers/Numbers.module.css";
import { errorMessage } from "@/app/helpers";
import { useNumbers } from "@/app/hooks/useNumbers";
import { useScoreNumbers, type NumbersScoreEntry } from "@/app/hooks/useScoreNumbers";
import { useUser } from "@/app/hooks/useUser";

const BOARD_SIZE = 20;

const NumbersPage = () => {
  const [showScores, setShowScores] = useState(false);
  const { user } = useUser();

  const { topScores, error, loadScores, saveScore, resetScore, recordEntry, myRank } = useScoreNumbers();
  const { numbers, steps, moves, isRight, loading, currentScore, handleClick, newGame } = useNumbers({
    onFinish: saveScore,
    onReset: resetScore,
  });

  // The game does not start by itself: the board is requested when Play is
  // pressed, which is when the server clock starts.
  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const order = useMemo(() => new Map(moves.map((move, step) => [move.i, step + 1])), [moves]);
  const isRecord = (entry: NumbersScoreEntry) =>
    Boolean(recordEntry && entry.score === recordEntry.score && entry.steps === recordEntry.steps);

  const hasBoard = numbers.length === BOARD_SIZE;
  const won = steps === BOARD_SIZE;
  const lost = !isRight;
  const gameOver = won || lost;
  const current = !lost && moves.length > 0 ? moves[moves.length - 1].i : null;

  const byScore = useMemo(() => [...topScores].sort((a, b) => b.score - a.score), [topScores]);

  const play = () => {
    setShowScores(false);
    newGame();
  };

  return (
    <GameShell
      game="numbers"
      actions={
        <Button variant="outlined" onClick={() => setShowScores((v) => !v)} startIcon={<EmojiEventsOutlined />}>
          {showScores ? "Back" : "Leaderboard"}
        </Button>
      }
    >
      {error && <Notice>{errorMessage(error)}</Notice>}

      {showScores ? (
        <Leaderboard<NumbersScoreEntry>
          title="Leaderboard"
          subtitle="Steps³ divided by time"
          rows={byScore}
          userOf={(entry) => entry.userId}
          currentUserId={user.id}
          isRecord={isRecord}
          columns={[
            { label: "Points", value: (entry) => entry.score, align: "right", strong: true },
            { label: "Steps", value: (entry) => entry.steps, align: "right" },
          ]}
        />
      ) : !hasBoard ? (
        <GameIntro
          game="numbers"
          title="Numbers"
          actions={
            <Button
              data-testid="play-btn"
              variant="contained"
              size="large"
              onClick={play}
              disabled={loading}
              startIcon={<PlayArrowRounded />}
            >
              {loading ? "Loading…" : "Play"}
            </Button>
          }
        >
          Visit all 20 squares of the ring, jumping exactly the number shown on the square you are on,
          in either direction, without stepping on any square twice. The clock starts when you press Play.
        </GameIntro>
      ) : (
        <div className={styles.stage}>
          <NumbersBoard
            numbers={numbers}
            order={order}
            current={current}
            lost={lost}
            loading={loading}
            disabled={loading || lost}
            onCell={handleClick}
          >
            <StepsRing steps={steps} />
            {gameOver ? (
              <p className={styles.status} data-testid="status" data-tone={won ? "win" : "lose"}>
                {won ? "Completed!" : "Game over"}
              </p>
            ) : (
              <p className={styles.score}>
                {steps === 0 ? "Start on any square" : <>Points <b className="num" data-testid="score-value">{currentScore}</b></>}
              </p>
            )}
            {gameOver && (
              <p className={styles.score}>
                Points <b className="num" data-testid="score-value">{currentScore}</b>
              </p>
            )}
            {gameOver && myRank && <RankBadge rank={myRank.rank} total={myRank.total} />}
            <Button
              data-testid="reset-btn"
              variant={gameOver ? "contained" : "outlined"}
              onClick={play}
              startIcon={<ReplayRounded />}
            >
              {gameOver ? "Play again" : "Restart"}
            </Button>
          </NumbersBoard>
        </div>
      )}
    </GameShell>
  );
};

export default NumbersPage;
