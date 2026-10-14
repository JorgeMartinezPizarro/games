import React, { type CSSProperties, type ReactNode } from "react";
import { COLS, ROWS, hardDropDistance, type Board, type Piece } from "@/app/hooks/useTetris";
import styles from "./Tetris.module.css";

// Standard Tetris colors. The engine (shared with the server-side replay)
// has its own; they are mapped here, for rendering only.
const PIECE_COLORS: Record<string, string> = {
  "#e03030": "#a78bfa", // T
  "#e0c030": "#facc15", // O
  "#30c030": "#4ade80", // S
  "#3070e0": "#f87171", // Z
  "#30d0d0": "#38bdf8", // I
  "#e07030": "#fb923c", // L
  "#a030e0": "#60a5fa", // J
};

export const pieceColor = (color: string): string => PIECE_COLORS[color.toLowerCase()] ?? color;

type Display = { kind: "empty" | "block" | "ghost"; color?: string };

export const TetrisBoard = React.memo(function TetrisBoard({
  board,
  piece,
  pos,
  active,
  lockVisual,
  lockBoard,
  flash,
  children,
}: {
  board: Board;
  piece: Piece;
  pos: { x: number; y: number };
  active: boolean;
  lockVisual?: boolean;
  lockBoard?: Board;
  flash: boolean;
  children?: ReactNode;
}) {
  const showingLock = Boolean(lockVisual && lockBoard);
  const source = showingLock ? (lockBoard as Board) : board;
  const display: Display[][] = source.map((row) =>
    row.map((cell) => (cell[1] === "clear" ? { kind: "empty" } : { kind: "block", color: cell[0] }))
  );

  if (!showingLock && active) {
    const ghostDist = hardDropDistance(board, piece, pos);
    piece.shape.forEach((row, py) =>
      row.forEach((cell, px) => {
        const y = pos.y + ghostDist + py;
        const x = pos.x + px;
        if (cell !== 0 && y >= 0 && y < ROWS && x >= 0 && x < COLS && display[y][x].kind === "empty") {
          display[y][x] = { kind: "ghost", color: piece.color };
        }
      })
    );
    piece.shape.forEach((row, py) =>
      row.forEach((cell, px) => {
        const y = pos.y + py;
        const x = pos.x + px;
        if (cell !== 0 && y >= 0 && y < ROWS && x >= 0 && x < COLS) {
          display[y][x] = { kind: "block", color: piece.color };
        }
      })
    );
  }

  return (
    <div className={styles.boardWrap}>
      <div className={`${styles.board} ${showingLock ? styles.locked : ""}`} data-flash={flash}>
        {display.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${y}-${x}`}
              className={`${styles.cell} ${cell.kind === "block" ? styles.block : cell.kind === "ghost" ? styles.ghost : ""}`}
              style={cell.color ? ({ "--c": pieceColor(cell.color) } as CSSProperties) : undefined}
            />
          ))
        )}
      </div>
      {children && <div className={styles.overlay}>{children}</div>}
    </div>
  );
});

// Next piece on a fixed 4×2 grid (any tetromino fits).
export const NextPiece = React.memo(function NextPiece({ piece, ready }: { piece: Piece; ready: boolean }) {
  const offsetX = Math.floor((4 - piece.shape[0].length) / 2);
  const offsetY = Math.floor((2 - piece.shape.length) / 2);
  const cells = Array.from({ length: 8 }, () => false);
  if (ready) {
    piece.shape.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell !== 0) cells[(y + offsetY) * 4 + x + offsetX] = true;
      })
    );
  }
  const color = pieceColor(piece.color);

  return (
    <div className={styles.next} aria-hidden>
      {cells.map((filled, i) => (
        <i key={i} style={{ background: filled ? color : "rgba(255, 255, 255, 0.04)" }} />
      ))}
    </div>
  );
});
