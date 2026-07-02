"use client";

import MainMenu from "@/app/components/MainMenu";
import { Box, Button, Typography } from "@mui/material";
import React, { useCallback, useMemo } from "react";
import "./styles.css";
import { Board, COLS, hardDropDistance, Piece, ROWS, useTetris } from "../../../../app/hooks/useTetris";
import { formatTimeMs, LeaderboardEntry, useScore } from "../../../../app/hooks/useTetrisScore";

// ───────────────────────── Tablero (memoizado) ─────────────────────────

interface BoardViewProps {
  board: Board;
  piece: Piece;
  pos: { x: number; y: number };
  lockVisual?: boolean;
  lockBoard?: Board;
}

const BoardView = React.memo(function BoardView({
  board,
  piece,
  pos,
  lockVisual,
  lockBoard,
}: BoardViewProps) {
  const showingLock = Boolean(lockVisual && lockBoard);
  const displaySource = showingLock ? (lockBoard as Board) : board;
  const display: string[][] = displaySource.map((row) =>
    row.map((cell) => (cell[1] === "clear" ? "black" : cell[0]))
  );

  if (!showingLock) {
    piece.shape.forEach((row, py) =>
      row.forEach((cell, px) => {
        if (cell !== 0) {
          const ny = pos.y + py;
          const nx = pos.x + px;
          if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
            display[ny][nx] = piece.color;
          }
        }
      })
    );
    const ghostDist = hardDropDistance(board, piece, pos);
    piece.shape.forEach((row, py) =>
      row.forEach((cell, px) => {
        if (cell !== 0) {
          const ny = pos.y + ghostDist + py;
          const nx = pos.x + px;
          if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && display[ny][nx] === "black") {
            display[ny][nx] = "ghost";
          }
        }
      })
    );
  }

  return (
    <Box className="tetris-board">
      {display.map((row, y) =>
        row.map((color, x) => (
          <div
            key={`${y}-${x}`}
            className="tetris-cell"
            style={{
              backgroundColor: color === "ghost" ? "transparent" : color,
              border:
                color === "ghost"
                  ? `1px solid ${piece.color}55`
                  : color === "black"
                  ? "1px solid #111"
                  : "1px solid rgba(255,255,255,0.18)",
              opacity: showingLock ? 0.8 : 1,
            }}
          />
        ))
      )}
    </Box>
  );
});

// ───────────────────────── Menú superior (memoizado) ─────────────────────────

interface MenuBarProps {
  showGame: boolean;
  onToggleView: () => void;
  onRestart: () => void;
  onTogglePause: () => void;
  isPaused: boolean;
  isLocked: boolean; // gameCompleted || gameOver
}

const MenuBar = React.memo(function MenuBar({
  showGame,
  onToggleView,
  onRestart,
  onTogglePause,
  isPaused,
  isLocked,
}: MenuBarProps) {
  return (
    <Box className="tetris-panel-width tetris-menu-bar">
      <Button
        size="small"
        variant={showGame ? "contained" : "outlined"}
        onClick={onToggleView}
        className={`tetris-menu-btn tetris-menu-btn--scores ${showGame ? "is-active" : ""}`}
      >
        {showGame ? "SCORES" : "PLAY"}
      </Button>
      {showGame && <Button
        size="small"
        variant="outlined"
        onClick={onRestart}
        className="tetris-menu-btn tetris-menu-btn--restart"
      >
        RESTART
      </Button>}
      {showGame && <Button
        size="small"
        variant="outlined"
        onClick={onTogglePause}
        disabled={isLocked}
        className={`tetris-menu-btn tetris-menu-btn--pause ${isPaused ? "is-paused" : ""} ${
          isLocked ? "is-disabled" : ""
        }`}
      >
        {isPaused ? "RESUME" : "PAUSE"}
      </Button>}
    </Box>
  );
});

// ───────────────────────── Controles móviles (memoizados) ─────────────────────────

interface MobileControlsProps {
  startRepeat: (key: string, action: () => void) => void;
  stopRepeat: (key: string) => void;
  moveLeft: () => void;
  moveRight: () => void;
  softDrop: () => void;
  rotateLeft: () => void;
  rotateRight: () => void;
}

const MobileControls = React.memo(function MobileControls({
  startRepeat,
  stopRepeat,
  moveLeft,
  moveRight,
  softDrop,
  rotateLeft,
  rotateRight,
}: MobileControlsProps) {
  // Evita que el evento "click" fantasma que sigue a un touchstart dispare
  // la acción dos veces en los botones de pulsación única (rotar).
  const lastWasTouch = React.useRef(false);
  const touchGuard = (action: () => void) => (e: React.TouchEvent) => {
    e.preventDefault();
    lastWasTouch.current = true;
    action();
  };
  const mouseGuard = (action: () => void) => () => {
    if (lastWasTouch.current) {
      lastWasTouch.current = false;
      return;
    }
    action();
  };

  return (
    <Box className="mobile-controls">
      <Button
        onTouchStart={touchGuard(() => startRepeat("ml", moveLeft))}
        onTouchEnd={() => stopRepeat("ml")}
        onMouseDown={mouseGuard(() => startRepeat("ml", moveLeft))}
        onMouseUp={() => stopRepeat("ml")}
        onMouseLeave={() => stopRepeat("ml")}
        aria-label="Izquierda (A)"
        className="mobile-controls-btn mobile-controls-btn--left"
      >
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="17,6 9,14 17,22" fill="#0ff" stroke="#011" strokeWidth="2" />
        </svg>
      </Button>

      <Button
        onTouchStart={touchGuard(() => startRepeat("mr", moveRight))}
        onTouchEnd={() => stopRepeat("mr")}
        onMouseDown={mouseGuard(() => startRepeat("mr", moveRight))}
        onMouseUp={() => stopRepeat("mr")}
        onMouseLeave={() => stopRepeat("mr")}
        aria-label="Derecha (D)"
        className="mobile-controls-btn mobile-controls-btn--right"
      >
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="11,6 19,14 11,22" fill="#0f7" stroke="#011" strokeWidth="2" />
        </svg>
      </Button>

      <Button
        onTouchStart={touchGuard(() => startRepeat("md", softDrop))}
        onTouchEnd={() => stopRepeat("md")}
        onMouseDown={mouseGuard(() => startRepeat("md", softDrop))}
        onMouseUp={() => stopRepeat("md")}
        onMouseLeave={() => stopRepeat("md")}
        aria-label="Bajar (S)"
        className="mobile-controls-btn mobile-controls-btn--down"
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="8,13 16,23 24,13" fill="#ffec40" stroke="#443" strokeWidth="2" />
        </svg>
      </Button>

      <Button
        onTouchStart={touchGuard(rotateLeft)}
        onMouseDown={mouseGuard(rotateLeft)}
        aria-label="Girar izquierda (O)"
        className="mobile-controls-btn mobile-controls-btn--rotate-left"
      >
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 18a7 7 0 1 1-6-10" stroke="#ffc800" strokeWidth="2.2" fill="none" />
          <polygon points="13,8 13,14 8,11" fill="#ffc800" />
        </svg>
      </Button>

      <Button
        onTouchStart={touchGuard(rotateRight)}
        onMouseDown={mouseGuard(rotateRight)}
        aria-label="Girar derecha (P)"
        className="mobile-controls-btn mobile-controls-btn--rotate-right"
      >
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 18a7 7 0 1 0 6-10" stroke="#ae7fff" strokeWidth="2.2" fill="none" />
          <polygon points="15,8 15,14 20,11" fill="#ae7fff" />
        </svg>
      </Button>
    </Box>
  );
});

// ───────────────────────── Marcador (memoizado) ─────────────────────────

const Scoreboard = React.memo(function Scoreboard({ topScores }: { topScores: LeaderboardEntry[] }) {
  const sorted = useMemo(() => [...topScores].sort((a, b) => a.timeMs - b.timeMs).slice(0, 10), [topScores]);
  return (
    <Box className="tetris-panel-width tetris-scoreboard">
      <Typography className="tetris-stat tetris-scoreboard-title">─ BEST TIMES ─</Typography>
      {sorted.length === 0 ? (
        <Typography className="tetris-stat tetris-scoreboard-empty">NO SCORES YET</Typography>
      ) : (
        <table className="tetris-scores-table">
          <thead>
            <tr>
              {["#", "USER", "TIME", "LINES"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => (
              <tr key={`${entry.userId}-${entry.timeMs}-${i}`} className={i === 0 ? "is-first" : "is-rest"}>
                <td>{i + 1}</td>
                <td>{entry.userId}</td>
                <td>{formatTimeMs(entry.timeMs)}</td>
                <td>{entry.linesTarget}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Box>
  );
});

// ───────────────────────── Componente principal ─────────────────────────

const Tetris: React.FC = () => {
  const [showGame, setShowGame] = React.useState(true);
  const score = useScore();
  const tetris = useTetris({ onComplete: score.saveScore });

  const {
    board,
    piece,
    pos,
    lines,
    linesTarget,
    isPaused,
    elapsedMs,
    gameCompleted,
    gameOver,
    lockVisual,
    lockBoard,
    ready,
    moveLeft,
    moveRight,
    softDrop,
    rotateLeft,
    rotateRight,
    restartGame,
    togglePause,
    startRepeat,
    stopRepeat,
  } = tetris;

  const handleRestart = useCallback(() => {
    score.resetSaveGuard();
    restartGame();
  }, [score, restartGame]);

  const handleToggleView = useCallback(() => setShowGame((v) => !v), []);

  return (
    <Box className="tetris-page">
      {/* ── Cabecera ── */}
      <Box className="tetris-header">
        <MainMenu />
        <MenuBar
          showGame={showGame}
          onToggleView={handleToggleView}
          onRestart={handleRestart}
          onTogglePause={togglePause}
          isPaused={isPaused}
          isLocked={!ready || gameCompleted || gameOver}
        />

        <Box className="tetris-panel-width tetris-stats-row">
			<Typography className="tetris-stat tetris-stat--lines">
				LINES: {Math.min(lines, linesTarget)}/{linesTarget}
			</Typography>
			<Typography
				className="tetris-stat tetris-stat--paused"
				style={{ visibility: !gameCompleted && !gameOver && (!ready || isPaused) ? "visible" : "hidden" }}
			>
				{!ready ? "LOADING…" : "PAUSED"}
			</Typography>
			<Typography className="tetris-stat tetris-stat--time">TIME: {formatTimeMs(elapsedMs)}</Typography>
			</Box>

			{gameCompleted && (
			<Typography className="tetris-status tetris-status--complete">
				★ COMPLETE: {formatTimeMs(elapsedMs)} ★
			</Typography>
			)}
			{gameOver && <Typography className="tetris-status tetris-status--over">GAME OVER</Typography>}
	    </Box>

      {/* ── Zona central: tablero o marcador ── */}
      <Box className={`tetris-main ${!showGame ? "tetris-main--scores" : ""}`}>
		{showGame ? (
			<BoardView board={board} piece={piece} pos={pos} lockVisual={lockVisual} lockBoard={lockBoard} />
		) : (
			<Scoreboard topScores={score.topScores} />
		)}
	  </Box>

      {/* ── Pie: controles móviles o ayuda de teclado ── */}
      {showGame && (
        <Box className="tetris-footer">
          <Box className="mobile-only">
            <MobileControls
              startRepeat={startRepeat}
              stopRepeat={stopRepeat}
              moveLeft={moveLeft}
              moveRight={moveRight}
              softDrop={softDrop}
              rotateLeft={rotateLeft}
              rotateRight={rotateRight}
            />
          </Box>
          <Box className="desktop-only">
            <Typography className="tetris-keyboard-hint">
				A/◀ MOVE LEFT &nbsp;|&nbsp; D/▶ MOVE RIGHT &nbsp;|&nbsp; S/▼ SOFT DROP &nbsp;|&nbsp; SPACE PAUSE
				&nbsp;|&nbsp; O ROTATE ↺ &nbsp;|&nbsp; P ROTATE ↻
			</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default Tetris;