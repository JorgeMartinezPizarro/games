import { useCallback, useEffect, useRef, useState } from "react";

export type Cell = [string, string];
export type Board = Cell[][];
export type Piece = { shape: number[][]; color: string };

export const LINES_TARGET = 25;
export const DROP_SPEED_MS = 184;
export const TIMER_TICK_MS = 10;
export const HOLD_INITIAL_DELAY = 300;
export const HOLD_REPEAT_RATE = 100;

export const ROWS = 20;
export const COLS = 10;

const createBoard = (rows: number = ROWS, cols: number = COLS): Board =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ["0", "clear"] as Cell)
  );

const rotate = (matrix: number[][]): number[][] =>
  matrix[0].map((_, colIndex) => matrix.map((row) => row[colIndex]).reverse());

const checkCollision = (
  board: Board,
  piece: Piece,
  x: number,
  y: number
): boolean => {
  return piece.shape.some((row, rowIndex) =>
    row.some((cell, colIndex) => {
      if (cell !== 0) {
        const newX = x + colIndex;
        const newY = y + rowIndex;
        if (
          newY >= board.length ||
          newX < 0 ||
          newX >= board[0].length ||
          (newY >= 0 && board[newY][newX][1] !== "clear")
        ) {
          return true;
        }
      }
      return false;
    })
  );
};

const TETROMINOS: Piece[] = [
  { shape: [[1, 1, 1], [0, 1, 0]], color: "#e03030" }, // T - red
  { shape: [[1, 1], [1, 1]], color: "#e0c030" }, // O - yellow
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#30c030" }, // S - green
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#3070e0" }, // Z - blue
  { shape: [[1, 1, 1, 1]], color: "#30d0d0" }, // I - cyan
  { shape: [[1, 1, 1], [1, 0, 0]], color: "#e07030" }, // L - orange
  { shape: [[1, 1, 1], [0, 0, 1]], color: "#a030e0" }, // J - purple
];

const getRandomPiece = (): Piece =>
  TETROMINOS[Math.floor(Math.random() * TETROMINOS.length)];

// ─── Puras helpers ──────────────────
function placePieceOnBoardPure(
  board: Board,
  piece: Piece,
  pos: { x: number; y: number }
): Board {
  const newBoard = board.map((row) => row.map((cell) => [...cell] as Cell));
  piece.shape.forEach((row, rowIndex) =>
    row.forEach((cell, colIndex) => {
      if (cell !== 0) {
        const ny = pos.y + rowIndex;
        const nx = pos.x + colIndex;
        if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
          newBoard[ny][nx] = [piece.color, "filled"];
        }
      }
    })
  );
  return newBoard;
}

function clearLinesPure(board: Board): { newBoard: Board; cleared: number } {
  const kept = board.filter((row) => row.some((cell) => cell[1] === "clear"));
  const cleared = board.length - kept.length;
  if (cleared === 0) return { newBoard: board, cleared: 0 };
  const newRows = Array.from({ length: cleared }, () =>
    Array.from({ length: board[0].length }, () => ["0", "clear"] as Cell)
  );
  return { newBoard: [...newRows, ...kept], cleared };
}

export function hardDropDistance(
  board: Board,
  piece: Piece,
  pos: { x: number; y: number }
): number {
  let dist = 0;
  while (!checkCollision(board, piece, pos.x, pos.y + dist + 1)) dist++;
  return dist;
}

// ───── GameState ──────────
interface GameState {
  board: Board;
  piece: Piece;
  pos: { x: number; y: number };
  lines: number;
  isPaused: boolean;
  elapsedMs: number;
  gameCompleted: boolean;
  gameOver: boolean;
  lockVisual?: boolean; // pinta el tablero "congelado" un instante al bloquear
  lockBoard?: Board;
}

// IMPORTANTE (fix hidratación): esta función se usa también como valor inicial
// de useState, que se ejecuta tanto en el servidor (SSR) como en el primer
// render del cliente. Si usáramos getRandomPiece() aquí, el servidor y el
// cliente generarían piezas distintas y React lanzaría un error de
// hidratación. Por eso la pieza inicial es SIEMPRE determinista
// (TETROMINOS[0]); la pieza aleatoria real se asigna después del montaje.
const initialGameState = (): GameState => ({
  board: createBoard(),
  piece: TETROMINOS[0],
  pos: { x: Math.floor(COLS / 2) - 1, y: 0 },
  lines: 0,
  isPaused: true,
  elapsedMs: 0,
  gameCompleted: false,
  gameOver: false,
});

// Solo se debe llamar en el cliente (useEffect / handlers), nunca como
// valor inicial de useState ni durante el render.
const randomizedInitialState = (): GameState => ({
  ...initialGameState(),
  piece: getRandomPiece(),
});

export interface UseTetrisOptions {
  /** Se llama una única vez cuando se completa la partida, con el tiempo final en ms */
  onComplete?: (timeMs: number) => void;
}

/**
 * Hook con toda la lógica y los efectos del juego (tablero, pieza activa,
 * gravedad, temporizador, teclado, pausa/restart). No contiene nada de UI.
 */
export function useTetris({ onComplete }: UseTetrisOptions = {}) {
  const [gameState, setGameState] = useState<GameState>(initialGameState());

  const gsRef = useRef<GameState>(gameState);
  gsRef.current = gameState;
  const startTimeRef = useRef<number | null>(null);
  const gameCompletedRef = useRef(false);
  // Mutex: evita que dos locks (gravedad + softDrop, o dos softDrop seguidos
  // durante el flash de 80ms del lock anterior) se ejecuten en paralelo y se
  // pisen el estado entre sí. Sin esto, en condiciones de carrera podían
  // desaparecer o duplicarse líneas al mantener pulsado "abajo".
  const lockingRef = useRef(false);
  const activeKeysRef = useRef<Set<string>>(new Set());
  const holdTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout | typeof setInterval>>
  >(new Map());

  const {
    board,
    piece,
    pos,
    lines,
    isPaused,
    elapsedMs,
    gameCompleted,
    gameOver,
    lockVisual,
    lockBoard,
  } = gameState;

  // Init: genera la primera pieza aleatoria solo en cliente
  useEffect(() => {
    setGameState(randomizedInitialState());
  }, []);

  /**
   * lockAndAdvance: bloquea pieza y avanza estado (inmediato salvo flag lockVisual)
   */
  const lockAndAdvance = useCallback(
    (
      board: Board,
      piece: Piece,
      pos: { x: number; y: number },
      currentLines: number,
      currentElapsed: number,
      forceLockVisual = false
    ) => {
      if (lockingRef.current) return; // ya hay un lock en curso: ignorar para evitar duplicar la pieza
      lockingRef.current = true;

      const newBoard = placePieceOnBoardPure(board, piece, pos);
      const { newBoard: clearedBoard, cleared } = clearLinesPure(newBoard);
      const totalLines = currentLines + cleared;

      const nextPiece = getRandomPiece();
      const nextPos = { x: Math.floor(COLS / 2) - 1, y: 0 };
      const isGameOver = checkCollision(
        clearedBoard,
        nextPiece,
        nextPos.x,
        nextPos.y
      );

      const isCompleted =
        !isGameOver && totalLines >= LINES_TARGET && !gameCompletedRef.current;

      if (isCompleted || forceLockVisual) {
        setGameState((prev) => ({
          ...prev,
          lockVisual: true,
          lockBoard: newBoard,
        }));
        setTimeout(() => {
          gameCompletedRef.current = isCompleted;
          const finalMs =
            startTimeRef.current != null
              ? Date.now() - startTimeRef.current
              : currentElapsed;
          setGameState((prev) => ({
            ...prev,
            board: clearedBoard,
            lines: totalLines,
            piece: nextPiece,
            pos: nextPos,
            isPaused: true,
            gameCompleted: isCompleted,
            gameOver: !isCompleted && isGameOver,
            elapsedMs: finalMs,
            lockVisual: false,
            lockBoard: undefined,
          }));
          if (isCompleted) onComplete?.(finalMs);
          lockingRef.current = false; // liberar el mutex al terminar el flash
        }, 80); // flash lock visual breve
        return;
      }
      if (isGameOver) {
        setGameState((prev) => ({
          ...prev,
          board: clearedBoard,
          lines: totalLines,
          isPaused: true,
          gameOver: true,
          lockVisual: false,
          lockBoard: undefined,
        }));
        lockingRef.current = false;
        return;
      }
      setGameState((prev) => ({
        ...prev,
        board: clearedBoard,
        lines: totalLines,
        piece: nextPiece,
        pos: nextPos,
        lockVisual: false,
        lockBoard: undefined,
      }));
      lockingRef.current = false;
    },
    [onComplete]
  );

  // Timer tick
  useEffect(() => {
    if (isPaused || gameCompleted || gameOver) return;
    const id = setInterval(() => {
      setGameState((prev) => {
        if (prev.isPaused || prev.gameCompleted || prev.gameOver) return prev;
        return {
          ...prev,
          elapsedMs:
            startTimeRef.current != null
              ? Date.now() - startTimeRef.current
              : prev.elapsedMs,
        };
      });
    }, TIMER_TICK_MS);
    return () => clearInterval(id);
  }, [isPaused, gameCompleted, gameOver]);

  // Gravedad
  useEffect(() => {
    if (isPaused || gameCompleted || gameOver) return;
    const id = setInterval(() => {
      const gs = gsRef.current;
      if (gs.isPaused || gs.gameCompleted || gs.gameOver || lockingRef.current) return;
      if (!checkCollision(gs.board, gs.piece, gs.pos.x, gs.pos.y + 1)) {
        setGameState((prev) => ({
          ...prev,
          pos: { ...prev.pos, y: prev.pos.y + 1 },
        }));
      } else {
        lockAndAdvance(gs.board, gs.piece, gs.pos, gs.lines, gs.elapsedMs);
      }
    }, DROP_SPEED_MS);
    return () => clearInterval(id);
  }, [isPaused, gameCompleted, gameOver, lockAndAdvance]);

  // Acciones
  const moveLeft = useCallback(() => {
    const gs = gsRef.current;
    if (gs.isPaused || gs.gameCompleted || gs.gameOver) return;
    if (!checkCollision(gs.board, gs.piece, gs.pos.x - 1, gs.pos.y)) {
      setGameState((prev) => ({ ...prev, pos: { ...prev.pos, x: prev.pos.x - 1 } }));
    }
  }, []);

  const moveRight = useCallback(() => {
    const gs = gsRef.current;
    if (gs.isPaused || gs.gameCompleted || gs.gameOver) return;
    if (!checkCollision(gs.board, gs.piece, gs.pos.x + 1, gs.pos.y)) {
      setGameState((prev) => ({ ...prev, pos: { ...prev.pos, x: prev.pos.x + 1 } }));
    }
  }, []);

  // Si lines+1 supera LINES_TARGET, fuerza lockVisual sí o sí
  const softDrop = useCallback(() => {
  const gs = gsRef.current;
  if (gs.isPaused || gs.gameCompleted || gs.gameOver || lockingRef.current) return;
  const nextY = gs.pos.y + 1;
  if (!checkCollision(gs.board, gs.piece, gs.pos.x, nextY)) {
    setGameState((prev) => ({ ...prev, pos: { ...prev.pos, y: nextY } }));
  } else {
    lockAndAdvance(gs.board, gs.piece, gs.pos, gs.lines, gs.elapsedMs);
    // sin pasar forceLockVisual=true: lockAndAdvance ya evalúa isCompleted internamente
  }
}, [lockAndAdvance]);

  const rotatePiece = useCallback((direction: 1 | -1) => {
    const gs = gsRef.current;
    if (gs.isPaused || gs.gameCompleted || gs.gameOver) return;
    const times = direction === 1 ? 1 : 3;
    let rotated = gs.piece.shape;
    for (let i = 0; i < times; i++) rotated = rotate(rotated);
    const rotatedPiece = { ...gs.piece, shape: rotated };
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!checkCollision(gs.board, rotatedPiece, gs.pos.x + kick, gs.pos.y)) {
        setGameState((prev) => ({
          ...prev,
          piece: rotatedPiece,
          pos: { ...prev.pos, x: prev.pos.x + kick },
        }));
        return;
      }
    }
  }, []);

  const rotateLeft = useCallback(() => rotatePiece(-1), [rotatePiece]);
  const rotateRight = useCallback(() => rotatePiece(1), [rotatePiece]);

  // Key repeat (mantener pulsado mueve repetidamente)
  const startRepeat = useCallback((key: string, action: () => void) => {
    if (activeKeysRef.current.has(key)) return;
    activeKeysRef.current.add(key);
    action();
    const timeout = setTimeout(() => {
      const interval = setInterval(action, HOLD_REPEAT_RATE);
      holdTimersRef.current.set(key + "_interval", interval);
    }, HOLD_INITIAL_DELAY);
    holdTimersRef.current.set(key, timeout);
  }, []);

  const stopRepeat = useCallback((key: string) => {
    activeKeysRef.current.delete(key);
    const timeout = holdTimersRef.current.get(key);
    if (timeout != null) {
      clearTimeout(timeout as ReturnType<typeof setTimeout>);
      holdTimersRef.current.delete(key);
    }
    const interval = holdTimersRef.current.get(key + "_interval");
    if (interval != null) {
      clearInterval(interval as ReturnType<typeof setInterval>);
      holdTimersRef.current.delete(key + "_interval");
    }
  }, []);

  const togglePause = useCallback(() => {
    setGameState((prev) => {
      if (prev.gameCompleted || prev.gameOver) return prev;
      if (prev.isPaused) {
        startTimeRef.current = Date.now() - prev.elapsedMs;
        return { ...prev, isPaused: false };
      }
      return { ...prev, isPaused: true };
    });
  }, []);

  // Keyboard handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          startRepeat("left", moveLeft);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          startRepeat("right", moveRight);
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          startRepeat("down", softDrop);
          break;
        case " ":
          e.preventDefault();
          togglePause();
          break;
        case "o":
        case "O":
          e.preventDefault();
          rotateLeft();
          break;
        case "p":
        case "P":
          e.preventDefault();
          rotateRight();
          break;
        default:
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          stopRepeat("left");
          break;
        case "ArrowRight":
        case "d":
        case "D":
          stopRepeat("right");
          break;
        case "ArrowDown":
        case "s":
        case "S":
          stopRepeat("down");
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [moveLeft, moveRight, softDrop, rotateLeft, rotateRight, togglePause, startRepeat, stopRepeat]);

  const restartGame = useCallback(() => {
    gameCompletedRef.current = false;
    lockingRef.current = false; // reset del mutex al reiniciar
    holdTimersRef.current.forEach((t, k) => {
      if (k.includes("interval")) clearInterval(t as ReturnType<typeof setInterval>);
      else clearTimeout(t as ReturnType<typeof setTimeout>);
    });
    holdTimersRef.current.clear();
    activeKeysRef.current.clear();
    startTimeRef.current = Date.now();
    const state = randomizedInitialState();
    setGameState({ ...state, isPaused: false });
  }, []);

  return {
    // estado
    board,
    piece,
    pos,
    lines,
    linesTarget: LINES_TARGET,
    isPaused,
    elapsedMs,
    gameCompleted,
    gameOver,
    lockVisual,
    lockBoard,
    // acciones
    moveLeft,
    moveRight,
    softDrop,
    rotateLeft,
    rotateRight,
    restartGame,
    togglePause,
    startRepeat,
    stopRepeat,
  };
}