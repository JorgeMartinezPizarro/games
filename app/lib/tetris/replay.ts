import {
  Board,
  COLS,
  LINES_TARGET,
  Piece,
  checkCollision,
  clearLinesPure,
  createBoard,
  placePieceOnBoardPure,
  rotate,
} from "@/app/lib/tetris/engine";
import { createPieceGenerator } from "@/app/lib/tetris/rng";

const ACTION_TYPES = new Set([
  "left",
  "right",
  "softDrop",
  "tick",
  "rotateLeft",
  "rotateRight",
  "pause",
  "resume",
  "end",
]);

export type TetrisAction = {
  type:
    | "left"
    | "right"
    | "softDrop"
    | "tick"
    | "rotateLeft"
    | "rotateRight"
    | "pause"
    | "resume"
    | "end";
  t: number;
};

// Sanity bounds: nothing to do with real games, they just keep an absurd
// payload (huge array or ridiculous duration) from making the server do
// extra work.
export const MAX_ACTIONS = 40000;
export const MAX_DURATION_MS = 60 * 60 * 1000; // 1h

export type ReplayResult =
  | { valid: true; lines: number }
  | { valid: false; reason: string };

function parseActions(raw: unknown): TetrisAction[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ACTIONS) {
    return null;
  }

  const actions: TetrisAction[] = [];
  let lastT = -1;

  for (const item of raw) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as any).type !== "string" ||
      !ACTION_TYPES.has((item as any).type) ||
      typeof (item as any).t !== "number" ||
      !Number.isFinite((item as any).t) ||
      (item as any).t < 0 ||
      (item as any).t > MAX_DURATION_MS ||
      (item as any).t < lastT
    ) {
      return null;
    }
    lastT = (item as any).t;
    actions.push({ type: (item as any).type, t: (item as any).t });
  }

  return actions;
}

// Replays the whole game (pieces derived from the seed + actions recorded
// by the client) with the same engine the client uses in real time
// (app/lib/tetris/engine.ts). It only counts as valid if the replay reaches
// LINES_TARGET legally.
//
// Important: gravity is NOT inferred from the timestamps. The browser's
// real setInterval isn't perfectly precise (the main thread is busy
// rendering, handling the keyboard, etc.), so assuming an exact
// DROP_SPEED_MS cadence here diverged from the client in long games
// (hundreds of ticks, each accumulating a few ms of delay). Instead, the
// client records every gravity drop as just another "tick" action, in the
// same log as left/right/softDrop — the replay simply processes the
// sequence exactly as it was recorded, without assuming anything about how
// much real time should have passed between actions.
export function replayTetris(seed: number, rawActions: unknown): ReplayResult {
  const actions = parseActions(rawActions);
  if (!actions) {
    return { valid: false, reason: "Malformed or empty action log." };
  }

  const getPiece = createPieceGenerator(seed);

  let board: Board = createBoard();
  let piece: Piece = getPiece();
  let pos = { x: Math.floor(COLS / 2) - 1, y: 0 };
  let lines = 0;
  let paused = true; // the real game also starts paused
  let gameOver = false;
  let completed = false;

  function lockAndAdvance() {
    const placed = placePieceOnBoardPure(board, piece, pos);
    const { newBoard, cleared } = clearLinesPure(placed);
    board = newBoard;
    lines += cleared;

    const nextPiece = getPiece();
    const nextPos = { x: Math.floor(COLS / 2) - 1, y: 0 };
    const isGameOver = checkCollision(board, nextPiece, nextPos.x, nextPos.y);

    if (!isGameOver && lines >= LINES_TARGET) {
      completed = true;
      return;
    }
    if (isGameOver) {
      gameOver = true;
      return;
    }
    piece = nextPiece;
    pos = nextPos;
  }

  function descendOrLock() {
    const nextY = pos.y + 1;
    if (!checkCollision(board, piece, pos.x, nextY)) {
      pos = { ...pos, y: nextY };
    } else {
      lockAndAdvance();
    }
  }

  for (const action of actions) {
    if (completed || gameOver) break;

    switch (action.type) {
      case "pause":
        paused = true;
        break;
      case "resume":
        paused = false;
        break;
      case "left":
        if (!paused && !checkCollision(board, piece, pos.x - 1, pos.y)) {
          pos = { ...pos, x: pos.x - 1 };
        }
        break;
      case "right":
        if (!paused && !checkCollision(board, piece, pos.x + 1, pos.y)) {
          pos = { ...pos, x: pos.x + 1 };
        }
        break;
      case "rotateLeft":
      case "rotateRight": {
        if (paused) break;
        const times = action.type === "rotateRight" ? 1 : 3;
        let rotated = piece.shape;
        for (let i = 0; i < times; i++) rotated = rotate(rotated);
        const rotatedPiece: Piece = { ...piece, shape: rotated };
        for (const kick of [0, -1, 1, -2, 2]) {
          if (!checkCollision(board, rotatedPiece, pos.x + kick, pos.y)) {
            piece = rotatedPiece;
            pos = { ...pos, x: pos.x + kick };
            break;
          }
        }
        break;
      }
      case "softDrop":
      case "tick":
        if (!paused) descendOrLock();
        break;
      case "end":
        // marker with no effect of its own: it only closes the log.
        break;
    }
  }

  if (completed) return { valid: true, lines };
  return {
    valid: false,
    reason: gameOver ? "Game over before reaching the target." : "Target not reached.",
  };
}
