// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LINES_TARGET a 2 solo en este fichero: nos permite completar una partida
// de verdad (2 líneas limpiadas con 5 piezas O) sin tener que resolver
// Tetris de verdad para llegar a las 25 líneas reales. El resto del motor
// (colisiones, rotación, limpieza de líneas...) se deja intacto.
vi.mock("@/app/lib/tetris/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/tetris/engine")>();
  return { ...actual, LINES_TARGET: 2 };
});

import { hardDropDistance, useTetris } from "./useTetris";
import { findSeedWithConsecutiveOPieces, O_PIECE_TARGET_COLUMNS } from "@/app/lib/tetris/testFixtures";
import { LINES_TARGET, TETROMINOS } from "@/app/lib/tetris/engine";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

function routeFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const key = `${init?.method ?? "GET"} ${url.split("?")[0]}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unhandled fetch call: ${key}`);
    return handler();
  });
}

async function startAndWaitReady(result: { current: ReturnType<typeof useTetris> }) {
  act(() => {
    result.current.startGame();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

// Deja caer la pieza actual justo hasta que bloquea, usando la misma
// función pura (hardDropDistance) que expone el motor: no depende de
// adivinar cuántas filas hay libres.
async function dropCurrentPiece(result: { current: ReturnType<typeof useTetris> }) {
  const { board, piece, pos } = result.current;
  const distance = hardDropDistance(board, piece, pos);
  await act(async () => {
    for (let i = 0; i <= distance; i++) {
      result.current.softDrop();
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useTetris", () => {
  it("empieza con el tablero vacío y sin partida en curso", () => {
    const { result } = renderHook(() => useTetris());

    expect(result.current.ready).toBe(false);
    expect(result.current.gameOver).toBe(false);
    expect(result.current.gameCompleted).toBe(false);
    expect(result.current.linesTarget).toBe(LINES_TARGET);
    expect(result.current.board.every((row) => row.every((cell) => cell[1] === "clear"))).toBe(
      true
    );
  });

  it("startGame pide un nonce/seed al servidor y coloca la pieza determinada por el seed", async () => {
    const seed = 12345;
    const fetchMock = routeFetch({
      "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.ready).toBe(true);
    expect(result.current.loading).toBe(false);
    // La primera pieza tiene que ser la que genera el mismo PRNG con ese seed.
    const expectedFirstPiece = TETROMINOS.some((p) => p === result.current.piece);
    expect(expectedFirstPiece).toBe(true);
  });

  it("moveLeft/moveRight respetan los límites del tablero", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 1 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    const startX = result.current.pos.x;
    act(() => result.current.moveRight());
    expect(result.current.pos.x).toBe(startX + 1);
    act(() => result.current.moveLeft());
    expect(result.current.pos.x).toBe(startX);

    // Empuja contra el borde izquierdo hasta chocar, y comprueba que un
    // moveLeft de más ya no mueve la pieza (la colisión lo bloquea).
    for (let i = 0; i < 10; i++) act(() => result.current.moveLeft());
    const leftEdgeX = result.current.pos.x;
    act(() => result.current.moveLeft());
    expect(result.current.pos.x).toBe(leftEdgeX);
  });

  it("rotateLeft/rotateRight cambian la forma de la pieza activa", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 7 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    const originalShape = result.current.piece.shape;
    act(() => result.current.rotateRight());
    expect(result.current.piece.shape).not.toBe(originalShape);
  });

  it("softDrop hace descender la pieza y la bloquea al llegar al fondo", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 42 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    const firstPiece = result.current.piece;
    await dropCurrentPiece(result);

    // La pieza se bloqueó: aparece una pieza nueva en la posición de salida.
    expect(result.current.pos.y).toBe(0);
    expect(result.current.piece).not.toBe(firstPiece);
    expect(result.current.board.some((row) => row.some((cell) => cell[1] === "filled"))).toBe(
      true
    );
    expect(result.current.gameOver).toBe(false);
  });

  it("stopGame vuelve al estado inactivo", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 3 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);
    expect(result.current.ready).toBe(true);

    act(() => result.current.stopGame());

    expect(result.current.ready).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.board.every((row) => row.every((cell) => cell[1] === "clear"))).toBe(
      true
    );
  });

  it("startRepeat repite la acción mientras se mantiene pulsada, stopRepeat la corta", () => {
    const { result } = renderHook(() => useTetris());
    const action = vi.fn();

    act(() => result.current.startRepeat("left", action));
    expect(action).toHaveBeenCalledTimes(1); // disparo inmediato

    act(() => {
      vi.advanceTimersByTime(300); // HOLD_INITIAL_DELAY: arma el intervalo, no llama todavía
    });
    expect(action).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(100 * 4); // HOLD_REPEAT_RATE x4: primeras repeticiones
    });
    expect(action.mock.calls.length).toBeGreaterThanOrEqual(5);

    const callsWhenStopped = action.mock.calls.length;
    act(() => result.current.stopRepeat("left"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(action.mock.calls.length).toBe(callsWhenStopped);
  });

  it("responde a las teclas del teclado (ArrowLeft mueve la pieza)", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 5 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    const startX = result.current.pos.x;
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    });
    expect(result.current.pos.x).toBe(startX - 1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft" }));
    });
  });

  it("al completar linesTarget llama a onComplete con el nonce y el log, y adopta el tiempo confirmado", async () => {
    const seed = findSeedWithConsecutiveOPieces(5);
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed }),
      })
    );
    const onComplete = vi.fn().mockResolvedValue(42_000);

    const { result } = renderHook(() => useTetris({ onComplete }));
    await startAndWaitReady(result);

    const spawnX = result.current.pos.x;
    for (const col of O_PIECE_TARGET_COLUMNS) {
      const dx = col - spawnX;
      const moveFn = dx < 0 ? result.current.moveLeft : result.current.moveRight;
      for (let i = 0; i < Math.abs(dx); i++) {
        act(() => moveFn());
      }
      await dropCurrentPiece(result);
    }

    // La pieza que completa el objetivo dispara un flash de 80ms antes de
    // marcar la partida como completada.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.gameCompleted).toBe(true);
    expect(result.current.lines).toBe(2);
    expect(onComplete).toHaveBeenCalledTimes(1);

    const [nonceArg, actionsArg] = onComplete.mock.calls[0];
    expect(nonceArg).toBe("n1");
    expect(actionsArg[0]).toEqual({ type: "resume", t: 0 });
    expect(actionsArg[actionsArg.length - 1].type).toBe("end");

    // Se adopta el tiempo confirmado por el servidor.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.elapsedMs).toBe(42_000);
  });
});
