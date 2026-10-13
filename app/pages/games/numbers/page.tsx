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

  // La partida no arranca sola: el tablero se pide al pulsar Jugar, que es
  // cuando arranca el reloj del servidor.
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
  const bySteps = useMemo(() => [...topScores].sort((a, b) => b.steps - a.steps), [topScores]);

  const play = () => {
    setShowScores(false);
    newGame();
  };

  return (
    <GameShell
      game="numbers"
      actions={
        <Button variant="outlined" onClick={() => setShowScores((v) => !v)} startIcon={<EmojiEventsOutlined />}>
          {showScores ? "Volver" : "Ranking"}
        </Button>
      }
    >
      {error && <Notice>{errorMessage(error)}</Notice>}

      {showScores ? (
        <div style={{ display: "grid", gap: 20 }}>
          <Leaderboard<NumbersScoreEntry>
            title="Mejor puntuación"
            subtitle="Pasos³ entre el tiempo"
            rows={byScore}
            userOf={(entry) => entry.userId}
            currentUserId={user.id}
            isRecord={isRecord}
            columns={[
              { label: "Puntos", value: (entry) => entry.score, align: "right", strong: true },
              { label: "Pasos", value: (entry) => entry.steps, align: "right" },
            ]}
          />
          <Leaderboard<NumbersScoreEntry>
            title="Más pasos"
            rows={bySteps}
            userOf={(entry) => entry.userId}
            currentUserId={user.id}
            isRecord={isRecord}
            columns={[
              { label: "Pasos", value: (entry) => entry.steps, align: "right", strong: true },
              { label: "Puntos", value: (entry) => entry.score, align: "right" },
            ]}
          />
        </div>
      ) : !hasBoard ? (
        <GameIntro
          game="numbers"
          title="Números"
          actions={
            <Button
              data-testid="play-btn"
              variant="contained"
              size="large"
              onClick={play}
              disabled={loading}
              startIcon={<PlayArrowRounded />}
            >
              {loading ? "Cargando…" : "Jugar"}
            </Button>
          }
        >
          Recorre las 20 casillas del anillo saltando exactamente lo que marca la casilla en la que estás,
          hacia un lado u otro, sin repetir ninguna. El reloj arranca al pulsar Jugar.
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
                {won ? "¡Completado!" : "Game over"}
              </p>
            ) : (
              <p className={styles.score}>
                {steps === 0 ? "Empieza por cualquier casilla" : <>Puntos <b className="num" data-testid="score-value">{currentScore}</b></>}
              </p>
            )}
            {gameOver && (
              <p className={styles.score}>
                Puntos <b className="num" data-testid="score-value">{currentScore}</b>
              </p>
            )}
            {gameOver && myRank && <RankBadge rank={myRank.rank} total={myRank.total} />}
            <Button
              data-testid="reset-btn"
              variant={gameOver ? "contained" : "outlined"}
              onClick={play}
              startIcon={<ReplayRounded />}
            >
              {gameOver ? "Jugar otra vez" : "Reiniciar"}
            </Button>
          </NumbersBoard>
        </div>
      )}
    </GameShell>
  );
};

export default NumbersPage;
