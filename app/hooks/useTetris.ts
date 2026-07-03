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
  | "tick"
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
  nextPiece: Piece;
  pos: { x: number; y: number };
  lines: number;
  elapsedMs: number;
  gameCompleted: boolean;
  gameOver: boolean;
  lockVisual?: boolean; // pinta el tablero "congelado" un instante al completar
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
  nextPiece: TETROMINOS[0],
  pos: { x: Math.floor(COLS / 2) - 1, y: 0 },
  lines: 0,
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
 * gravedad, temporizador, teclado, start/stop). No contiene nada de UI.
 *
 * Las piezas ya no salen de Math.random(): se generan con un PRNG con seed
 * que emite /api/tetris/new-game (app/lib/tetris/rng.ts), y cada acción del
 * jugador se registra con su timestamp relativo al inicio de la partida
 * (app/lib/tetris/replay.ts la usa para reproducir y validar la partida
 * completa en el backend antes de guardar el score).
 *
 * MODELO SÍNCRONO (importante): todo el estado del juego vive en `stateRef`
 * como fuente de verdad, y cada acción (mover, girar, soft-drop, gravedad)
 * se procesa de forma SÍNCRONA contra esa ref exactamente igual que hace el
 * replay del servidor (app/lib/tetris/replay.ts). React solo recibe una copia
 * para pintar. Antes esto se hacía con updaters de setState + un `pendingLock`
 * asíncrono, lo que abría una ventana de carrera: al desplazar la pieza justo
 * en el instante del bloqueo, la acción se registraba en el log pero el
 * cliente la descartaba (updater tardío) mientras el servidor sí la aplicaba a
 * la pieza siguiente → tablero desincronizado ("Target not reached") y piezas
 * que se "hundían". Al aplicar cada acción de inmediato y registrarla en el
 * MISMO instante, el orden de aplicación coincide siempre con el del log, así
 * que cliente y servidor reproducen tableros idénticos.
 */
export function useTetris({ onComplete }: UseTetrisOptions = {}) {
  const [gameState, setGameState] = useState<GameState>(initialGameState());
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fuente de verdad síncrona del estado. Toda mutación lee stateRef.current,
  // calcula el siguiente estado y lo publica con applyState (que actualiza la
  // ref Y el estado de React a la vez). Como los callbacks de JS son atómicos
  // (un solo hilo), gravedad, teclado y soft-drop nunca se pisan: cada uno ve
  // el resultado ya aplicado del anterior.
  const stateRef = useRef<GameState>(gameState);

  const startTimeRef = useRef<number | null>(null);
  const gameCompletedRef = useRef(false);
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
  // Se incrementa en cada llamada a startNewGame y en stopGame. Si dos
  // llamadas se solapan (un START disparado antes de que resolviera uno
  // anterior, o un STOP mientras la petición está en vuelo), la que NO sea
  // la más reciente al resolver se descarta entera — sin tocar ninguna ref
  // compartida — para que nunca se mezclen nonce/seed de dos partidas
  // distintas.
  const gameGenerationRef = useRef(0);

  const {
    board,
    piece,
    nextPiece,
    pos,
    lines,
    elapsedMs,
    gameCompleted,
    gameOver,
    lockVisual,
    lockBoard,
  } = gameState;

  // Publica un nuevo estado: actualiza la ref autoritativa SÍNCRONAMENTE y
  // luego pide el re-render. Nunca se usan updaters funcionales para la
  // lógica del juego: la ref ya garantiza que cada acción parte del estado
  // más reciente, sin depender de cuándo confirme React.
  const applyState = useCallback((next: GameState) => {
    stateRef.current = next;
    setGameState(next);
  }, []);

  const logAction = useCallback((type: TetrisActionType) => {
    const t = gameStartRef.current != null ? Date.now() - gameStartRef.current : 0;
    actionsRef.current.push({ type, t });
  }, []);

  const drawPiece = useCallback((): Piece => {
    return pieceGenRef.current ? pieceGenRef.current() : TETROMINOS[0];
  }, []);

  const startNewGame = useCallback(async () => {
    const myGeneration = ++gameGenerationRef.current;
    setReady(false);
    setLoading(true);
    try {
      const res = await fetch("/bookmarks/api/tetris/new-game", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start a new game");
      const data = await res.json();

      if (gameGenerationRef.current !== myGeneration) {
        // Otra llamada a startNewGame más reciente ya está en curso (o ya
        // terminó, o el usuario pulsó STOP): esta respuesta llegó tarde y
        // se descarta sin tocar nonceRef/pieceGenRef/gameStartRef/actionsRef.
        return null;
      }

      nonceRef.current = data.nonce;
      gameStartRef.current = Date.now();
      pieceGenRef.current = createPieceGenerator(data.seed);
      // La partida ya no admite pausa manual: arranca inmediatamente, así
      // que el log siempre lleva un "resume" en t=0 para que el replay del
      // servidor levante su bandera interna de pausa (ver replay.ts).
      actionsRef.current = [{ type: "resume", t: 0 }];
      setReady(true);

      // Se piden dos piezas: la actual y la siguiente (para el preview). El
      // servidor solo consume una pieza al inicio y una por cada bloqueo
      // (lockAndAdvance), así que este adelanto extra en el cliente no
      // desincroniza el replay: la pieza "actual" en cualquier punto del
      // juego siempre coincide con la misma llamada del generador que usa
      // el servidor en ese mismo punto.
      const firstPiece = pieceGenRef.current();
      const previewPiece = pieceGenRef.current();
      return { piece: firstPiece, nextPiece: previewPiece };
    } catch (error) {
      console.error("Error starting tetris game:", error);
      if (gameGenerationRef.current === myGeneration) setReady(false);
      return null;
    } finally {
      if (gameGenerationRef.current === myGeneration) setLoading(false);
    }
  }, []);

  /**
   * lockAndAdvance: bloquea la pieza sobre el tablero, limpia líneas y avanza a
   * la siguiente. Mismo procedimiento (y mismo orden de consumo de piezas) que
   * el replay del servidor. La única parte asíncrona es el "flash" de 80ms al
   * COMPLETAR la partida, que es terminal y por tanto no puede desincronizar
   * nada: a partir de ahí no se procesan más acciones.
   */
  const lockAndAdvance = useCallback(
    (s: GameState): void => {
      const placed = placePieceOnBoardPure(s.board, s.piece, s.pos);
      const { newBoard: clearedBoard, cleared } = clearLinesPure(placed);
      const totalLines = s.lines + cleared;

      const spawnedPiece = s.nextPiece;
      const upcomingPiece = drawPiece();
      const nextPos = { x: Math.floor(COLS / 2) - 1, y: 0 };
      const isGameOver = checkCollision(clearedBoard, spawnedPiece, nextPos.x, nextPos.y);
      const isCompleted =
        !isGameOver && totalLines >= LINES_TARGET && !gameCompletedRef.current;

      if (isCompleted) {
        // Flash breve del tablero con la pieza ya colocada (sin limpiar líneas
        // todavía) antes de finalizar y enviar el score.
        applyState({ ...s, lockVisual: true, lockBoard: placed });
        setTimeout(() => {
          gameCompletedRef.current = true;
          const finalMs =
            startTimeRef.current != null
              ? Date.now() - startTimeRef.current
              : s.elapsedMs;
          applyState({
            ...stateRef.current,
            board: clearedBoard,
            lines: totalLines,
            piece: spawnedPiece,
            nextPiece: upcomingPiece,
            pos: nextPos,
            gameCompleted: true,
            gameOver: false,
            elapsedMs: finalMs,
            lockVisual: false,
            lockBoard: undefined,
          });
          if (nonceRef.current) {
            logAction("end");
            const nonce = nonceRef.current;
            const actions = [...actionsRef.current];
            const result = onComplete?.(nonce, actions);
            if (result && typeof (result as Promise<number | null>).then === "function") {
              (result as Promise<number | null>).then((confirmed) => {
                if (typeof confirmed === "number") {
                  applyState({ ...stateRef.current, elapsedMs: confirmed });
                }
              });
            }
          }
        }, 80); // flash lock visual breve
        return;
      }
      if (isGameOver) {
        applyState({
          ...s,
          board: clearedBoard,
          lines: totalLines,
          gameOver: true,
          lockVisual: false,
          lockBoard: undefined,
        });
        return;
      }
      applyState({
        ...s,
        board: clearedBoard,
        lines: totalLines,
        piece: spawnedPiece,
        nextPiece: upcomingPiece,
        pos: nextPos,
        lockVisual: false,
        lockBoard: undefined,
      });
    },
    [drawPiece, logAction, onComplete, applyState]
  );

  // Baja la pieza una fila; si choca, la bloquea. Equivale a descendOrLock del
  // replay del servidor. Se procesa SÍNCRONAMENTE contra stateRef.
  const descendOrLock = useCallback(
    (s: GameState): void => {
      const nextY = s.pos.y + 1;
      if (!checkCollision(s.board, s.piece, s.pos.x, nextY)) {
        applyState({ ...s, pos: { ...s.pos, y: nextY } });
      } else {
        lockAndAdvance(s);
      }
    },
    [applyState, lockAndAdvance]
  );

  // ── Acciones del jugador y gravedad ──
  // Todas siguen el mismo patrón: si el juego no está listo o ya terminó (o
  // está en el flash de completado), no hacen nada NI registran log. En caso
  // contrario registran su acción y la aplican de inmediato con exactamente
  // los mismos guards que el replay del servidor (colisión). Así el
  // log refleja siempre lo que el cliente aplicó, en el mismo orden.

  const moveLeft = useCallback(() => {
    const s = stateRef.current;
    if (!ready || s.gameCompleted || s.gameOver || s.lockVisual) return;
    logAction("left");
    if (!checkCollision(s.board, s.piece, s.pos.x - 1, s.pos.y)) {
      applyState({ ...s, pos: { ...s.pos, x: s.pos.x - 1 } });
    }
  }, [ready, logAction, applyState]);

  const moveRight = useCallback(() => {
    const s = stateRef.current;
    if (!ready || s.gameCompleted || s.gameOver || s.lockVisual) return;
    logAction("right");
    if (!checkCollision(s.board, s.piece, s.pos.x + 1, s.pos.y)) {
      applyState({ ...s, pos: { ...s.pos, x: s.pos.x + 1 } });
    }
  }, [ready, logAction, applyState]);

  const softDrop = useCallback(() => {
    const s = stateRef.current;
    if (!ready || s.gameCompleted || s.gameOver || s.lockVisual) return;
    logAction("softDrop");
    descendOrLock(s);
  }, [ready, logAction, descendOrLock]);

  const rotatePiece = useCallback(
    (direction: 1 | -1) => {
      const s = stateRef.current;
      if (!ready || s.gameCompleted || s.gameOver || s.lockVisual) return;
      logAction(direction === 1 ? "rotateRight" : "rotateLeft");
      const times = direction === 1 ? 1 : 3;
      let rotated = s.piece.shape;
      for (let i = 0; i < times; i++) rotated = rotate(rotated);
      const rotatedPiece = { ...s.piece, shape: rotated };
      for (const kick of [0, -1, 1, -2, 2]) {
        if (!checkCollision(s.board, rotatedPiece, s.pos.x + kick, s.pos.y)) {
          applyState({
            ...s,
            piece: rotatedPiece,
            pos: { ...s.pos, x: s.pos.x + kick },
          });
          return;
        }
      }
    },
    [ready, logAction, applyState]
  );

  const rotateLeft = useCallback(() => rotatePiece(-1), [rotatePiece]);
  const rotateRight = useCallback(() => rotatePiece(1), [rotatePiece]);

  // Gravedad. Cada caída automática se registra como una acción "tick" más
  // en el mismo log que left/right/softDrop — el servidor NO infiere la
  // gravedad a partir del tiempo transcurrido (el setInterval real del
  // navegador no es perfectamente preciso: en partidas largas, cientos de
  // ticks acumulando unos pocos ms de retraso cada uno hacían que el
  // replay aplicase más caídas de las que realmente hubo).
  const gravityTick = useCallback(() => {
    const s = stateRef.current;
    if (s.gameCompleted || s.gameOver || s.lockVisual) return;
    logAction("tick");
    descendOrLock(s);
  }, [logAction, descendOrLock]);

  // Timer tick
  useEffect(() => {
    if (!ready || gameCompleted || gameOver) return;
    const id = setInterval(() => {
      const s = stateRef.current;
      if (s.gameCompleted || s.gameOver) return;
      const elapsed =
        startTimeRef.current != null ? Date.now() - startTimeRef.current : s.elapsedMs;
      applyState({ ...s, elapsedMs: elapsed });
    }, TIMER_TICK_MS);
    return () => clearInterval(id);
  }, [ready, gameCompleted, gameOver, applyState]);

  // Gravedad
  useEffect(() => {
    if (!ready || gameCompleted || gameOver) return;
    const id = setInterval(gravityTick, DROP_SPEED_MS);
    return () => clearInterval(id);
  }, [ready, gameCompleted, gameOver, gravityTick]);

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
  }, [moveLeft, moveRight, softDrop, rotateLeft, rotateRight, startRepeat, stopRepeat]);

  // START: arranca una partida nueva (tanto la primera como cualquier
  // reinicio posterior a un STOP/game over/completado).
  const startGame = useCallback(() => {
    gameCompletedRef.current = false;
    holdTimersRef.current.forEach((t, k) => {
      if (k.includes("interval")) clearInterval(t as ReturnType<typeof setInterval>);
      else clearTimeout(t as ReturnType<typeof setTimeout>);
    });
    holdTimersRef.current.clear();
    activeKeysRef.current.clear();

    startNewGame().then((result) => {
      if (!result) return;
      startTimeRef.current = Date.now();
      applyState({
        ...initialGameState(),
        piece: result.piece,
        nextPiece: result.nextPiece,
      });
    });
  }, [startNewGame, applyState]);

  // STOP: abandona la partida en curso (o la petición de arranque en
  // vuelo) y vuelve al estado inactivo, sin pieza visible.
  const stopGame = useCallback(() => {
    gameGenerationRef.current += 1; // invalida cualquier startNewGame pendiente
    gameCompletedRef.current = false;
    holdTimersRef.current.forEach((t, k) => {
      if (k.includes("interval")) clearInterval(t as ReturnType<typeof setInterval>);
      else clearTimeout(t as ReturnType<typeof setTimeout>);
    });
    holdTimersRef.current.clear();
    activeKeysRef.current.clear();
    setReady(false);
    setLoading(false);
    applyState(initialGameState());
  }, [applyState]);

  return {
    // estado
    board,
    piece,
    nextPiece,
    pos,
    lines,
    linesTarget: LINES_TARGET,
    elapsedMs,
    gameCompleted,
    gameOver,
    lockVisual,
    lockBoard,
    ready,
    loading,
    // acciones
    moveLeft,
    moveRight,
    softDrop,
    rotateLeft,
    rotateRight,
    startGame,
    stopGame,
    startRepeat,
    stopRepeat,
  };
}
