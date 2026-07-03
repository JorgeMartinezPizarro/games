// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { useChessGame } from "./useChessGame";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

// Cada key mapea a una cola de respuestas: si tiene más de una, se consumen
// en orden (una por llamada); si solo queda una, se reutiliza para llamadas
// adicionales imprevistas.
function routeFetch(handlers: Record<string, Array<() => Response | Promise<Response>>>) {
  const queues = new Map(Object.entries(handlers).map(([k, v]) => [k, [...v]]));
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const key = `${init?.method ?? "GET"} ${url.split("?")[0]}`;
    const queue = queues.get(key);
    if (!queue || queue.length === 0) throw new Error(`Unhandled fetch call: ${key}`);
    const handler = queue.length > 1 ? queue.shift()! : queue[0];
    return handler();
  });
}

async function playAndSettle(
  onDrop: (from: string, to: string) => boolean,
  from: string,
  to: string
) {
  act(() => {
    onDrop(from, to);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
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

describe("useChessGame", () => {
  it("inicializa el tablero con la posición de salida", () => {
    const { result } = renderHook(() => useChessGame());
    expect(result.current.fen).toBe(new Chess().fen());
    expect(result.current.gameStarted).toBe(false);
    expect(result.current.isGameOver).toBe(false);
  });

  it("handleEloChange solo cambia el elo si la partida no ha empezado", () => {
    const { result } = renderHook(() => useChessGame());

    act(() => result.current.handleEloChange({} as Event, 1200));
    expect(result.current.elo).toBe(1200);
  });

  it("handleEloChange ignora cambios una vez empezada la partida", () => {
    vi.stubGlobal("fetch", routeFetch({}));
    const { result } = renderHook(() => useChessGame());

    act(() => {
      result.current.onDrop("e2", "e4");
    });
    expect(result.current.gameStarted).toBe(true);

    act(() => result.current.handleEloChange({} as Event, 2000));
    expect(result.current.elo).toBe(400);
  });

  it("onSquareClick selecciona una pieza propia y resalta sus destinos legales", () => {
    const { result } = renderHook(() => useChessGame());

    act(() => {
      result.current.onSquareClick("e2" as Square);
    });

    expect(result.current.optionSquares).toHaveProperty("e3");
    expect(result.current.optionSquares).toHaveProperty("e4");
  });

  it("onSquareClick sobre la misma casilla deselecciona", () => {
    const { result } = renderHook(() => useChessGame());

    act(() => result.current.onSquareClick("e2" as Square));
    expect(Object.keys(result.current.optionSquares).length).toBeGreaterThan(0);

    act(() => result.current.onSquareClick("e2" as Square));
    expect(result.current.optionSquares).toEqual({});
  });

  it("onDrop rechaza un movimiento ilegal sin llamar al servidor", () => {
    const fetchMock = routeFetch({});
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChessGame());

    let moved = true;
    act(() => {
      moved = result.current.onDrop("e2", "e5"); // 3 casillas: ilegal
    });

    expect(moved).toBe(false);
    expect(result.current.gameStarted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("onDrop aplica la jugada local y, tras la pausa, la del servidor", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/chess/new-game": [() => jsonResponse({ nonce: "n1", timestamp: 1 })],
        "POST /bookmarks/api/chess": [() => jsonResponse({ bestmove: "e7e5", gameOver: false })],
      })
    );
    const { result } = renderHook(() => useChessGame());

    let moved = false;
    act(() => {
      moved = result.current.onDrop("e2", "e4");
    });
    expect(moved).toBe(true);
    expect(result.current.gameStarted).toBe(true);
    expect(result.current.isAIThinking).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.isAIThinking).toBe(false);
    const expected = new Chess();
    expected.move({ from: "e2", to: "e4" });
    expected.move({ from: "e7", to: "e5" });
    expect(result.current.fen).toBe(expected.fen());
  });

  it("si el servidor no valida la jugada, resetea la partida y expone el error", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/chess/new-game": [() => jsonResponse({ nonce: "n1", timestamp: 1 })],
        "POST /bookmarks/api/chess": [() => jsonResponse({ error: "nonce expired" }, false)],
      })
    );
    const { result } = renderHook(() => useChessGame());

    await playAndSettle(result.current.onDrop, "e2", "e4");

    expect(result.current.fen).toBe("start");
    expect(result.current.gameStarted).toBe(false);
    expect(result.current.gameError).toMatch(/desincronizó/);
  });

  it("resetGame limpia el estado y llama a onReset", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/chess/new-game": [() => jsonResponse({ nonce: "n1", timestamp: 1 })],
        "POST /bookmarks/api/chess": [() => jsonResponse({ bestmove: "e7e5", gameOver: false })],
      })
    );
    const onReset = vi.fn();
    const { result } = renderHook(() => useChessGame({ onReset }));

    await playAndSettle(result.current.onDrop, "e2", "e4");
    expect(result.current.gameStarted).toBe(true);

    act(() => result.current.resetGame());

    expect(result.current.fen).toBe("start");
    expect(result.current.gameStarted).toBe(false);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("cuando el jugador da jaque mate, llama a onPlayerWin con el nonce de la partida", async () => {
    // Mate pastor (Scholar's Mate): 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
    const onPlayerWin = vi.fn();
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/chess/new-game": [() => jsonResponse({ nonce: "n1", timestamp: 1 })],
        "POST /bookmarks/api/chess": [
          () => jsonResponse({ bestmove: "e7e5", gameOver: false }),
          () => jsonResponse({ bestmove: "b8c6", gameOver: false }),
          () => jsonResponse({ bestmove: "g8f6", gameOver: false }),
          () => jsonResponse({ bestmove: null, gameOver: true }),
        ],
      })
    );

    const { result } = renderHook(() => useChessGame({ onPlayerWin }));

    await playAndSettle(result.current.onDrop, "e2", "e4");
    await playAndSettle(result.current.onDrop, "d1", "h5");
    await playAndSettle(result.current.onDrop, "f1", "c4");
    await playAndSettle(result.current.onDrop, "h5", "f7");

    expect(onPlayerWin).toHaveBeenCalledTimes(1);
    expect(onPlayerWin).toHaveBeenCalledWith("n1");
    expect(result.current.isGameOver).toBe(true);
    expect(result.current.gameResult).toBe("Jugador gana (mate)");
  });
});
