"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@mui/material";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import { Chessboard } from "react-chessboard";
import GameShell from "@/app/components/GameShell";
import Leaderboard from "@/app/components/Leaderboard";
import ResultPanel, { type ResultTone } from "@/app/components/ResultPanel";
import { Notice, RankBadge } from "@/app/components/ui";
import { DifficultyPicker } from "@/app/components/chess/DifficultyPicker";
import { MoveList } from "@/app/components/chess/MoveList";
import { PlayerCard } from "@/app/components/chess/PlayerCard";
import styles from "@/app/components/chess/Chess.module.css";
import { useChessGame } from "@/app/hooks/useChessGame";
import { useChessScore, type ChessScoreEntry } from "@/app/hooks/useChessScore";
import { useUser } from "@/app/hooks/useUser";

const LIGHT_SQUARE = { backgroundColor: "#e3e8ef" };
const DARK_SQUARE = { backgroundColor: "#7d93ab" };
const LAST_MOVE = { background: "rgba(245, 181, 68, 0.5)" };
const IN_CHECK = {
  background: "radial-gradient(circle, rgba(248, 113, 113, 0.95) 0%, rgba(248, 113, 113, 0.55) 45%, transparent 75%)",
};

// Resultado del hook ("Jugador gana (mate)", "IA gana (mate)", "Empate (…)")
// → tono y título de la tarjeta final.
function describeResult(result: string): { tone: ResultTone; title: string; subtitle: string } {
  if (result.startsWith("Jugador")) return { tone: "win", title: "¡Jaque mate!", subtitle: "Has ganado a Stockfish." };
  if (result.startsWith("IA")) return { tone: "lose", title: "Stockfish gana", subtitle: "Jaque mate a tu rey." };
  return { tone: "neutral", title: "Tablas", subtitle: result.replace(/^Empate\s*/, "").replace(/[()]/g, "") };
}

const ChessGame: React.FC = () => {
  const [showScores, setShowScores] = useState(false);
  const [hideResult, setHideResult] = useState(false);
  const { user } = useUser();

  const score = useChessScore();
  const chess = useChessGame({
    onPlayerWin: score.saveScore,
    onReset: score.resetSaveGuard,
  });

  const {
    fen,
    elo,
    history,
    lastMove,
    checkSquare,
    gameResult,
    gameStarted,
    isAIThinking,
    isGameOver,
    gameError,
    optionSquares,
    handleEloChange,
    resetGame,
    onSquareClick,
    onDrop,
  } = chess;

  const squareStyles = useMemo(
    () => ({
      ...(lastMove ? { [lastMove.from]: LAST_MOVE, [lastMove.to]: LAST_MOVE } : {}),
      ...(checkSquare ? { [checkSquare]: IN_CHECK } : {}),
      ...optionSquares,
    }),
    [lastMove, checkSquare, optionSquares]
  );

  const newGame = () => {
    setHideResult(false);
    resetGame();
  };

  const sortedScores = useMemo(
    () => [...score.topScores].sort((a, b) => b.elo - a.elo),
    [score.topScores]
  );

  const displayError = gameError || score.scoreError;
  const result = gameResult ? describeResult(gameResult) : null;
  const playerName = user.id === "anonymous" ? "Tú" : user.name;
  const yourTurn = !isGameOver && !isAIThinking;

  return (
    <GameShell
      game="chess"
      actions={
        <Button variant="outlined" onClick={() => setShowScores((v) => !v)} startIcon={<EmojiEventsOutlined />}>
          {showScores ? "Volver a la partida" : "Ranking"}
        </Button>
      }
    >
      {showScores ? (
        <Leaderboard<ChessScoreEntry>
          title="Ranking"
          subtitle="ELO más alto al que has dado mate"
          rows={sortedScores}
          userOf={(entry) => entry.userId}
          currentUserId={user.id}
          columns={[
            { label: "ELO", value: (entry) => entry.elo, align: "right", strong: true },
            { label: "Fecha", value: (entry) => new Date(entry.time).toLocaleDateString("es-ES"), align: "right" },
          ]}
        />
      ) : (
        <div className={styles.layout}>
          <div className={styles.boardColumn}>
            <div className={styles.boardWrap}>
              <Chessboard
                id="chessboard"
                position={fen}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customSquareStyles={squareStyles}
                customLightSquareStyle={LIGHT_SQUARE}
                customDarkSquareStyle={DARK_SQUARE}
                customDropSquareStyle={{ boxShadow: "inset 0 0 0 4px rgba(245, 181, 68, 0.85)" }}
                customNotationStyle={{ fontSize: "11px", fontWeight: "600" }}
                customBoardStyle={{ borderRadius: "14px", boxShadow: "0 30px 60px rgba(0, 0, 0, 0.45)" }}
                animationDuration={200}
                arePiecesDraggable={!isGameOver && !isAIThinking}
              />
              {result && !hideResult && (
                <div className={styles.overlay}>
                  <ResultPanel
                    tone={result.tone}
                    title={result.title}
                    subtitle={result.subtitle}
                    stats={[
                      { label: "ELO rival", value: elo },
                      { label: "Jugadas", value: Math.ceil(history.length / 2) },
                    ]}
                    footer={score.myRank && <RankBadge rank={score.myRank.rank} total={score.myRank.total} />}
                    actions={
                      <>
                        <Button variant="contained" onClick={newGame} startIcon={<ReplayRounded />}>
                          Nueva partida
                        </Button>
                        <Button variant="text" onClick={() => setHideResult(true)}>
                          Ver tablero
                        </Button>
                      </>
                    }
                  />
                </div>
              )}
            </div>
            <div className={styles.status} aria-live="polite">
              <span>
                {isGameOver
                  ? gameResult
                  : isAIThinking
                  ? "Stockfish está pensando…"
                  : gameStarted
                  ? "Te toca mover"
                  : "Juegas con blancas: mueve para empezar"}
              </span>
            </div>
            {displayError && <Notice>{displayError}</Notice>}
          </div>

          <aside className={styles.side}>
            <PlayerCard
              name="Stockfish"
              meta={`ELO ${elo} · negras`}
              active={isAIThinking}
              thinking={isAIThinking}
            />
            <div data-slot="moves">
              <MoveList history={history} />
            </div>
            <div data-slot="difficulty">
              <DifficultyPicker
                elo={elo}
                locked={gameStarted}
                onChange={(value) => handleEloChange(new Event("change"), value)}
              />
            </div>
            <PlayerCard
              you
              name={playerName}
              meta={yourTurn ? "Blancas · te toca" : "Blancas"}
              active={yourTurn && gameStarted}
            />
            <Button data-slot="new" variant="outlined" onClick={newGame} startIcon={<ReplayRounded />}>
              Nueva partida
            </Button>
          </aside>
        </div>
      )}
    </GameShell>
  );
};

export default ChessGame;
