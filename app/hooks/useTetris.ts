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
  pos: { x: number; y: number };
  lines: number;
  isPaused: boolean;
  elapsedMs: number;
  gameCompleted: boolean;
  gameOver: boolean;
  lockVisual?: boolean; // pinta el tablero "congelado" un instante al bloquear
  lockBoard?: Board;
  // La pieza chocó al intentar bajar (gravedad o soft drop): un useEffect
  // reacciona a este flag y dispara lockAndAdvance con el estado YA
  // confirmado por React (nunca desde dentro del propio updater: los
  // updaters de setState no garantizan ejecutarse de forma síncrona, así
  // que no son sitio seguro para efectos secundarios como llamar a
  // lockAndAdvance).
  pendingLock: boolean;
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
  pendingLock: false,
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
  // Se incrementa en cada llamada a startNewGame. Si dos llamadas se
  // solapan (StrictMode remontando el efecto de inicio, o un restart
  // disparado antes de que la petición anterior resolviera), la que NO sea
  // la más reciente al resolver se descarta entera — sin tocar ninguna ref
  // compartida — para que nunca se mezclen nonce/seed de dos partidas
  // distintas.
  const gameGenerationRef = useRef(0);

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
    pendingLock,
  } = gameState;

  // startRepeat (más abajo) captura la función de acción UNA sola vez, al
  // empezar a mantener pulsada la tecla, y reutiliza esa misma clausura
  // durante todo el hold vía setInterval — así que si moveLeft/softDrop/etc.
  // comprueban la variable `pendingLock` capturada en su propio closure,
  // ese valor queda congelado al momento en que empezó el hold y nunca ve
  // los bloqueos que ocurren DESPUÉS (justo el caso de mantener "abajo"
  // pulsado a través de varias piezas). Por eso el guard usa esta ref, que
  // sí se mantiene al día en cada render sin importar qué closure la lea.
  const pendingLockRef = useRef(false);
  pendingLockRef.current = pendingLock;

  const logAction = useCallback((type: TetrisActionType) => {
    const t = gameStartRef.current != null ? Date.now() - gameStartRef.current : 0;
    actionsRef.current.push({ type, t });
  }, []);

  const nextPiece = useCallback((): Piece => {
    return pieceGenRef.current ? pieceGenRef.current() : TETROMINOS[0];
  }, []);

  const startNewGame = useCallback(async (autoStart: boolean) => {
    const myGeneration = ++gameGenerationRef.current;
    setReady(false);
    try {
      const res = await fetch("/bookmarks/api/tetris/new-game", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start a new game");
      const data = await res.json();

      if (gameGenerationRef.current !== myGeneration) {
        // Otra llamada a startNewGame más reciente ya está en curso (o ya
        // terminó): esta respuesta llegó tarde y se descarta sin tocar
        // nonceRef/pieceGenRef/gameStartRef/actionsRef.
        return null;
      }

      nonceRef.current = data.nonce;
      gameStartRef.current = Date.now();
      pieceGenRef.current = createPieceGenerator(data.seed);
      actionsRef.current = autoStart ? [{ type: "resume", t: 0 }] : [];
      setReady(true);

      return pieceGenRef.current();
    } catch (error) {
      console.error("Error starting tetris game:", error);
      if (gameGenerationRef.current === myGeneration) setReady(false);
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

  // Intenta bajar la pieza una fila (gravedad o soft drop). La decisión
  // (mover vs. marcar pendingLock) se toma DENTRO del updater funcional,
  // contra el "prev" que React garantiza fresco — nunca contra una ref que
  // solo se actualiza en el render (ver bug: gravedad y soft-drop podían
  // disparar casi a la vez y decidir los dos con la misma posición vieja).
  // Importante: aquí NO se llama a lockAndAdvance directamente — el updater
  // de setState no garantiza ejecutarse de forma síncrona, así que llamarlo
  // desde dentro (o justo después, leyendo una variable que el updater
  // hubiera mutado) puede no ejecutarse nunca y dejar la pieza congelada.
  // En su lugar, solo se marca pendingLock:true en el estado, y un
  // useEffect aparte (que sí ve el estado ya confirmado) dispara el lock.
  const attemptDescend = useCallback(() => {
    setGameState((prev) => {
      if (prev.isPaused || prev.gameCompleted || prev.gameOver || prev.pendingLock) return prev;
      const nextY = prev.pos.y + 1;
      if (!checkCollision(prev.board, prev.piece, prev.pos.x, nextY)) {
        return { ...prev, pos: { ...prev.pos, y: nextY } };
      }
      return { ...prev, pendingLock: true };
    });
  }, []);

  // Dispara el lock en cuanto pendingLock se confirma en el estado (nunca
  // desde dentro del propio updater de setGameState, ver comentario arriba).
  useEffect(() => {
    if (!pendingLock) return;
    setGameState((prev) => (prev.pendingLock ? { ...prev, pendingLock: false } : prev));
    lockAndAdvance(board, piece, pos, lines, elapsedMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLock]);

  // Gravedad. Cada caída automática se registra como una acción "tick" más
  // en el mismo log que left/right/softDrop — el servidor NO infiere la
  // gravedad a partir del tiempo transcurrido (el setInterval real del
  // navegador no es perfectamente preciso: en partidas largas, cientos de
  // ticks acumulando unos pocos ms de retraso cada uno hacían que el
  // replay aplicase más caídas de las que realmente hubo). Se ignora igual
  // que el resto de acciones si hay un lock pendiente de procesar.
  useEffect(() => {
    if (isPaused || gameCompleted || gameOver) return;
    const id = setInterval(() => {
      if (pendingLockRef.current) return;
      logAction("tick");
      attemptDescend();
    }, DROP_SPEED_MS);
    return () => clearInterval(id);
  }, [isPaused, gameCompleted, gameOver, attemptDescend, logAction]);

  // Acciones. Se registra la acción siempre que el juego esté listo Y no haya
  // un lock pendiente de procesar. Ese "pendingLock" abre una ventana real
  // (el useEffect que lo procesa no es síncrono) en la que el jugador puede
  // seguir soltando teclas sin que hagan nada visible en el cliente — pero
  // el replay del servidor SÍ es síncrono, así que si registrásemos esas
  // acciones igualmente, el servidor las aplicaría de verdad a la pieza
  // siguiente (que en el cliente nunca las recibió), desincronizando el
  // tablero. Por eso hay que ignorarlas (ni loggear ni tocar el estado)
  // exactamente igual en el cliente que en el servidor. El guard usa
  // pendingLockRef (no la variable pendingLock del closure): con la tecla
  // mantenida pulsada, startRepeat reutiliza la misma función durante todo
  // el hold, así que un guard basado en el closure quedaría congelado en el
  // valor de cuando empezó a mantenerse pulsada y nunca vería los bloqueos
  // ocurridos después — justo el caso real de mantener "abajo" pulsado.
  const moveLeft = useCallback(() => {
    if (!ready || pendingLockRef.current) return;
    logAction("left");
    setGameState((prev) => {
      if (prev.isPaused || prev.gameCompleted || prev.gameOver || prev.pendingLock) return prev;
      if (!checkCollision(prev.board, prev.piece, prev.pos.x - 1, prev.pos.y)) {
        return { ...prev, pos: { ...prev.pos, x: prev.pos.x - 1 } };
      }
      return prev;
    });
  }, [ready, logAction]);

  const moveRight = useCallback(() => {
    if (!ready || pendingLockRef.current) return;
    logAction("right");
    setGameState((prev) => {
      if (prev.isPaused || prev.gameCompleted || prev.gameOver || prev.pendingLock) return prev;
      if (!checkCollision(prev.board, prev.piece, prev.pos.x + 1, prev.pos.y)) {
        return { ...prev, pos: { ...prev.pos, x: prev.pos.x + 1 } };
      }
      return prev;
    });
  }, [ready, logAction]);

  const softDrop = useCallback(() => {
    if (!ready || pendingLockRef.current) return;
    logAction("softDrop");
    attemptDescend();
  }, [ready, logAction, attemptDescend]);

  const rotatePiece = useCallback(
    (direction: 1 | -1) => {
      if (!ready || pendingLockRef.current) return;
      logAction(direction === 1 ? "rotateRight" : "rotateLeft");
      setGameState((prev) => {
        if (prev.isPaused || prev.gameCompleted || prev.gameOver || prev.pendingLock) return prev;
        const times = direction === 1 ? 1 : 3;
        let rotated = prev.piece.shape;
        for (let i = 0; i < times; i++) rotated = rotate(rotated);
        const rotatedPiece = { ...prev.piece, shape: rotated };
        for (const kick of [0, -1, 1, -2, 2]) {
          if (!checkCollision(prev.board, rotatedPiece, prev.pos.x + kick, prev.pos.y)) {
            return {
              ...prev,
              piece: rotatedPiece,
              pos: { ...prev.pos, x: prev.pos.x + kick },
            };
          }
        }
        return prev;
      });
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

  // Igual que el resto de acciones: nada de efectos secundarios (logAction,
  // mutar startTimeRef) dentro del updater de setGameState — React
  // StrictMode invoca los updaters dos veces a propósito para detectar
  // impurezas, y aquí duplicaba la acción "resume"/"pause" en el log
  // (single-user-action, no hay carrera real con isPaused/gameCompleted del
  // último render: togglePause solo lo dispara una pulsación humana).
  const togglePause = useCallback(() => {
    if (!ready || gameCompleted || gameOver) return;
    if (isPaused) {
      startTimeRef.current = Date.now() - elapsedMs;
      logAction("resume");
    } else {
      logAction("pause");
    }
    setGameState((prev) => {
      if (prev.gameCompleted || prev.gameOver) return prev;
      return { ...prev, isPaused: !prev.isPaused };
    });
  }, [ready, gameCompleted, gameOver, isPaused, elapsedMs, logAction]);

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
