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

// Hook result ("Player wins (checkmate)", "AI wins (checkmate)", "Draw (…)")
// → tone and title of the result card.
function describeResult(result: string): { tone: ResultTone; title: string; subtitle: string } {
  if (result.startsWith("Player")) return { tone: "win", title: "Checkmate!", subtitle: "You beat Stockfish." };
  if (result.startsWith("AI")) return { tone: "lose", title: "Stockfish wins", subtitle: "Your king is checkmated." };
  const reason = result.replace(/^Draw\s*/, "").replace(/[()]/g, "");
  return { tone: "neutral", title: "Draw", subtitle: reason ? reason.charAt(0).toUpperCase() + reason.slice(1) + "." : "" };
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
  const playerName = user.id === "anonymous" ? "You" : user.name;
  const yourTurn = !isGameOver && !isAIThinking;

  return (
    <GameShell
      game="chess"
      actions={
        <Button variant="outlined" onClick={() => setShowScores((v) => !v)} startIcon={<EmojiEventsOutlined />}>
          {showScores ? "Back to game" : "Leaderboard"}
        </Button>
      }
    >
      {showScores ? (
        <Leaderboard<ChessScoreEntry>
          title="Leaderboard"
          subtitle="Highest ELO checkmated"
          rows={sortedScores}
          userOf={(entry) => entry.userId}
          currentUserId={user.id}
          columns={[
            { label: "ELO", value: (entry) => entry.elo, align: "right", strong: true },
            { label: "Date", value: (entry) => new Date(entry.time).toLocaleDateString("en-US"), align: "right" },
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
                      { label: "Opponent ELO", value: elo },
                      { label: "Moves", value: Math.ceil(history.length / 2) },
                    ]}
                    footer={score.myRank && <RankBadge rank={score.myRank.rank} total={score.myRank.total} />}
                    actions={
                      <>
                        <Button variant="contained" onClick={newGame} startIcon={<ReplayRounded />}>
                          New game
                        </Button>
                        <Button variant="text" onClick={() => setHideResult(true)}>
                          View board
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
                  ? "Stockfish is thinking…"
                  : gameStarted
                  ? "Your move"
                  : "You play white: move to start"}
              </span>
            </div>
            {displayError && <Notice>{displayError}</Notice>}
          </div>

          <aside className={styles.side}>
            <PlayerCard
              name="Stockfish"
              meta={`ELO ${elo} · black`}
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
              meta={yourTurn ? "White · your move" : "White"}
              active={yourTurn && gameStarted}
            />
            <Button data-slot="new" variant="outlined" onClick={newGame} startIcon={<ReplayRounded />}>
              New game
            </Button>
          </aside>
        </div>
      )}
    </GameShell>
  );
};

export default ChessGame;
