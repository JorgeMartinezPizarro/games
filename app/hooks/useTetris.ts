import { useCallback, useEffect, useRef, useState } from "react";
import {
  Board,
  COLS,
  DROP_SPEED_MS,
  LINES_TARGET,
  Piece,
  ROWS,
  TETROMINOS,
  checkCollision,
  clearLinesPure,
  createBoard,
  hardDropDistance,
  placePieceOnBoardPure,
  rotate,
} from "@/app/lib/tetris/engine";
import { createPieceGenerator } from "@/app/lib/tetris/rng";

export type { Cell, Board, Piece } from "@/app/lib/tetris/engine";
export { LINES_TARGET, hardDropDistance, ROWS, COLS };

export const TIMER_TICK_MS = 10;
export const HOLD_INITIAL_DELAY = 300;
export const HOLD_REPEAT_RATE = 100;

export type TetrisActionType =
  | "left"
  | "right"
  | "softDrop"
  | "rotateLeft"
  | "rotateRight"
  | "pause"
  | "resume"
  | "end";

export type TetrisAction = { type: TetrisActionType; t: number };

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
// render del cliente. La pieza inicial es SIEMPRE determinista
// (TETROMINOS[0]); la pieza real (derivada del seed que emite el servidor)
// se asigna después del montaje, cuando llega /api/tetris/new-game.
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

export interface UseTetrisOptions {
  /**
   * Se llama una única vez cuando se completa la partida, con el nonce y el
   * log de acciones para que el backend la reproduzca y valide. Puede
   * devolver (o resolver a) el tiempo confirmado por el servidor, que se
   * adopta como elapsedMs final.
   */
  onComplete?: (
    nonce: string,
    actions: TetrisAction[]
  ) => void | Promise<number | null>;
}

/**
 * Hook con toda la lógica y los efectos del juego (tablero, pieza activa,
 * gravedad, temporizador, teclado, pausa/restart). No contiene nada de UI.
 *
 * Las piezas ya no salen de Math.random(): se generan con un PRNG con seed
 * que emite /api/tetris/new-game (app/lib/tetris/rng.ts), y cada acción del
 * jugador se registra con su timestamp relativo al inicio de la partida
 * (app/lib/tetris/replay.ts la usa para reproducir y validar la partida
 * completa en el backend antes de guardar el score).
 */
export function useTetris({ onComplete }: UseTetrisOptions = {}) {
  const [gameState, setGameState] = useState<GameState>(initialGameState());
  const [ready, setReady] = useState(false);

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

  // Nonce/seed de la partida actual (emitidos por el servidor) y log de
  // acciones para el replay de validación.
  const nonceRef = useRef<string | null>(null);
  const pieceGenRef = useRef<(() => Piece) | null>(null);
  const gameStartRef = useRef<number | null>(null); // ancla t=0 para el log de acciones
  const actionsRef = useRef<TetrisAction[]>([]);

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

  const logAction = useCallback((type: TetrisActionType) => {
    const t = gameStartRef.current != null ? Date.now() - gameStartRef.current : 0;
    actionsRef.current.push({ type, t });
  }, []);

  const nextPiece = useCallback((): Piece => {
    return pieceGenRef.current ? pieceGenRef.current() : TETROMINOS[0];
  }, []);

  const startNewGame = useCallback(async (autoStart: boolean) => {
    setReady(false);
    try {
      const res = await fetch("/bookmarks/api/tetris/new-game", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start a new game");
      const data = await res.json();

      nonceRef.current = data.nonce;
      gameStartRef.current = Date.now();
      pieceGenRef.current = createPieceGenerator(data.seed);
      actionsRef.current = autoStart ? [{ type: "resume", t: 0 }] : [];
      setReady(true);

      return pieceGenRef.current();
    } catch (error) {
      console.error("Error starting tetris game:", error);
      setReady(false);
      return null;
    }
  }, []);

  // Init: pide la partida (nonce + seed) al servidor solo en cliente
  useEffect(() => {
    let cancelled = false;
    startNewGame(false).then((firstPiece) => {
      if (cancelled || !firstPiece) return;
      setGameState((prev) => ({ ...prev, piece: firstPiece }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const spawnedPiece = nextPiece();
      const nextPos = { x: Math.floor(COLS / 2) - 1, y: 0 };
      const isGameOver = checkCollision(
        clearedBoard,
        spawnedPiece,
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
            piece: spawnedPiece,
            pos: nextPos,
            isPaused: true,
            gameCompleted: isCompleted,
            gameOver: !isCompleted && isGameOver,
            elapsedMs: finalMs,
            lockVisual: false,
            lockBoard: undefined,
          }));
          if (isCompleted && nonceRef.current) {
            logAction("end");
            const nonce = nonceRef.current;
            const actions = [...actionsRef.current];
            const result = onComplete?.(nonce, actions);
            if (result && typeof (result as Promise<number | null>).then === "function") {
              (result as Promise<number | null>).then((confirmed) => {
                if (typeof confirmed === "number") {
                  setGameState((prev) => ({ ...prev, elapsedMs: confirmed }));
                }
              });
            }
          }
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
        piece: spawnedPiece,
        pos: nextPos,
        lockVisual: false,
        lockBoard: undefined,
      }));
      lockingRef.current = false;
    },
    [nextPiece, logAction, onComplete]
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
    if (!ready || gs.isPaused || gs.gameCompleted || gs.gameOver) return;
    logAction("left");
    if (!checkCollision(gs.board, gs.piece, gs.pos.x - 1, gs.pos.y)) {
      setGameState((prev) => ({ ...prev, pos: { ...prev.pos, x: prev.pos.x - 1 } }));
    }
  }, [ready, logAction]);

  const moveRight = useCallback(() => {
    const gs = gsRef.current;
    if (!ready || gs.isPaused || gs.gameCompleted || gs.gameOver) return;
    logAction("right");
    if (!checkCollision(gs.board, gs.piece, gs.pos.x + 1, gs.pos.y)) {
      setGameState((prev) => ({ ...prev, pos: { ...prev.pos, x: prev.pos.x + 1 } }));
    }
  }, [ready, logAction]);

  // Si lines+1 supera LINES_TARGET, fuerza lockVisual sí o sí
  const softDrop = useCallback(() => {
    const gs = gsRef.current;
    if (!ready || gs.isPaused || gs.gameCompleted || gs.gameOver || lockingRef.current) return;
    logAction("softDrop");
    const nextY = gs.pos.y + 1;
    if (!checkCollision(gs.board, gs.piece, gs.pos.x, nextY)) {
      setGameState((prev) => ({ ...prev, pos: { ...prev.pos, y: nextY } }));
    } else {
      lockAndAdvance(gs.board, gs.piece, gs.pos, gs.lines, gs.elapsedMs);
      // sin pasar forceLockVisual=true: lockAndAdvance ya evalúa isCompleted internamente
    }
  }, [ready, logAction, lockAndAdvance]);

  const rotatePiece = useCallback(
    (direction: 1 | -1) => {
      const gs = gsRef.current;
      if (!ready || gs.isPaused || gs.gameCompleted || gs.gameOver) return;
      logAction(direction === 1 ? "rotateRight" : "rotateLeft");
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
    },
    [ready, logAction]
  );

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
    if (!ready) return;
    setGameState((prev) => {
      if (prev.gameCompleted || prev.gameOver) return prev;
      if (prev.isPaused) {
        startTimeRef.current = Date.now() - prev.elapsedMs;
        logAction("resume");
        return { ...prev, isPaused: false };
      }
      logAction("pause");
      return { ...prev, isPaused: true };
    });
  }, [ready, logAction]);

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

    startNewGame(true).then((firstPiece) => {
      if (!firstPiece) return;
      startTimeRef.current = Date.now();
      setGameState({
        ...initialGameState(),
        piece: firstPiece,
        isPaused: false,
      });
    });
  }, [startNewGame]);

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
    ready,
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
