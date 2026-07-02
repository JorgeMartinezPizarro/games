import {
  Board,
  COLS,
  DROP_SPEED_MS,
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
    | "rotateLeft"
    | "rotateRight"
    | "pause"
    | "resume"
    | "end";
  t: number;
};

// Cotas de cordura: nada que ver con partidas reales, solo evitan que un
// payload absurdo (array gigante o duración disparatada) haga trabajar de
// más al servidor.
const MAX_ACTIONS = 20000;
const MAX_DURATION_MS = 60 * 60 * 1000; // 1h

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

// Reproduce la partida entera (piezas derivadas del seed + acciones con
// timestamp) con el mismo motor que usa el cliente en tiempo real
// (app/lib/tetris/engine.ts), incluyendo la gravedad automática. Solo se
// considera válida si el replay llega de forma legal a LINES_TARGET.
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
  let paused = true; // la partida real también arranca en pausa
  let gameOver = false;
  let completed = false;
  let lastGravityAt = 0;

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

  function applyGravityUpTo(t: number) {
    while (!paused && !gameOver && !completed && t - lastGravityAt >= DROP_SPEED_MS) {
      lastGravityAt += DROP_SPEED_MS;
      if (!checkCollision(board, piece, pos.x, pos.y + 1)) {
        pos = { ...pos, y: pos.y + 1 };
      } else {
        lockAndAdvance();
      }
    }
  }

  for (const action of actions) {
    if (completed || gameOver) break;

    applyGravityUpTo(action.t);
    if (completed || gameOver) break;

    switch (action.type) {
      case "pause":
        paused = true;
        break;
      case "resume":
        paused = false;
        lastGravityAt = action.t;
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
      case "softDrop": {
        if (paused) break;
        const nextY = pos.y + 1;
        if (!checkCollision(board, piece, pos.x, nextY)) {
          pos = { ...pos, y: nextY };
        } else {
          lockAndAdvance();
        }
        break;
      }
      case "end":
        // marcador sin efecto propio: solo fuerza el applyGravityUpTo de
        // más arriba a ponerse al día hasta el instante final reportado.
        break;
    }
  }

  if (completed) return { valid: true, lines };
  return {
    valid: false,
    reason: gameOver ? "Game over before reaching the target." : "Target not reached.",
  };
}
