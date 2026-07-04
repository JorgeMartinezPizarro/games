// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CellValues } from "@/app/types";
import { useNumbers } from "./useNumbers";

function cell(i: number, n: number, b = false): CellValues {
  return { values: { n, b, i } };
}

// Tablero "anillo" de 20 casillas con salto 1: cada casilla i solo se puede
// alcanzar desde i-1 o i+1 (mod 20). Simple y determinista para completar
// un tour entero. El hook usa 20 como módulo fijo (BOARD_SIZE real), así
// que cualquier tablero de prueba debe tener exactamente 20 celdas.
function ringBoard(): CellValues[] {
  return Array.from({ length: 20 }, (_, i) => cell(i, 1));
}

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

async function startNewGame(
  result: { current: ReturnType<typeof useNumbers> },
  board: CellValues[]
) {
  vi.stubGlobal(
    "fetch",
    routeFetch({
      "POST /bookmarks/api/numbers/new-game": () =>
        jsonResponse({ nonce: "nonce-1", timestamp: 1, board }),
    })
  );
  await act(async () => {
    await result.current.newGame();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
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

describe("useNumbers", () => {
  it("empieza sin tablero y sin cargar", () => {
    const { result } = renderHook(() => useNumbers());
    expect(result.current.numbers).toEqual([]);
    expect(result.current.steps).toBe(0);
    expect(result.current.isRight).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("newGame carga el tablero del servidor y llama a onReset", async () => {
    const board = ringBoard();
    const onReset = vi.fn();
    const { result } = renderHook(() => useNumbers({ onReset }));

    await startNewGame(result, board);

    expect(result.current.numbers).toEqual(board);
    expect(result.current.steps).toBe(0);
    expect(result.current.isRight).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("un clic válido marca la casilla, suma un paso y actualiza el score en vivo", async () => {
    const board = ringBoard();
    const { result } = renderHook(() => useNumbers());
    await startNewGame(result, board);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current.handleClick(board[0]);
    });

    expect(result.current.steps).toBe(1);
    // elapsedMs = 150 (startNewGame) + 1000 (avance del test) = 1150.
    // liveScore = round(steps^3 * 3500 / elapsedMs) = round(3500/1150) = 3
    expect(result.current.currentScore).toBe(3);
  });

  it("un clic sin relación de salto válida termina la partida sin sumar el paso", async () => {
    const board = ringBoard();
    board[0] = cell(0, 4); // desde 0 con salto 4, los únicos destinos válidos son 4 y 16
    const onFinish = vi.fn();
    const { result } = renderHook(() => useNumbers({ onFinish }));
    await startNewGame(result, board);

    act(() => result.current.handleClick(board[0])); // primer clic: siempre válido
    expect(result.current.steps).toBe(1);

    act(() => result.current.handleClick(board[10])); // 10 no es 4 ni 16: ilegal

    expect(result.current.isRight).toBe(false);
    expect(result.current.steps).toBe(1); // el clic ilegal no cuenta
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [, finalSteps, moves] = onFinish.mock.calls[0];
    expect(finalSteps).toBe(1);
    expect(moves).toEqual([0]);
  });

  it("quedarse sin movimientos posibles (bloqueo) termina la partida", async () => {
    // A(0,n=4) -> B(4,n=2) -> C(2,n=2): al marcar C, sus dos vecinos según
    // su propio salto (2±2 mod 20 = {0,4}) ya están visitados (A y B).
    const board = ringBoard();
    board[0] = cell(0, 4);
    board[4] = cell(4, 2);
    board[2] = cell(2, 2);
    const onFinish = vi.fn();
    const { result } = renderHook(() => useNumbers({ onFinish }));
    await startNewGame(result, board);

    act(() => result.current.handleClick(board[0]));
    act(() => result.current.handleClick(board[4]));
    act(() => result.current.handleClick(board[2]));

    expect(result.current.steps).toBe(3);
    expect(result.current.isRight).toBe(false);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [, finalSteps, moves] = onFinish.mock.calls[0];
    expect(finalSteps).toBe(3);
    expect(moves).toEqual([0, 4, 2]);
  });

  it("completar las 20 casillas termina la partida (ganada) y llama a onFinish", async () => {
    const board = ringBoard();
    const onFinish = vi.fn();
    const { result } = renderHook(() => useNumbers({ onFinish }));
    await startNewGame(result, board);

    for (let i = 0; i < 20; i++) {
      act(() => result.current.handleClick(board[i]));
    }

    expect(result.current.steps).toBe(20);
    expect(result.current.isRight).toBe(true); // completar no es "perder"
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [, finalSteps, moves, nonce] = onFinish.mock.calls[0];
    expect(finalSteps).toBe(20);
    expect(moves).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(nonce).toBe("nonce-1");
  });

  it("adopta el score confirmado que devuelve onFinish", async () => {
    const board = ringBoard();
    const onFinish = vi.fn().mockResolvedValue(999);
    const { result } = renderHook(() => useNumbers({ onFinish }));
    await startNewGame(result, board);

    act(() => vi.advanceTimersByTime(1000));
    await act(async () => {
      result.current.handleClick(board[0]);
      result.current.handleClick(board[19]); // vecino válido (salto 1) -> se bloquea o sigue
    });
    // Forzamos el fin de partida con un clic inválido para dejar currentScore
    // en manos de onFinish.
    await act(async () => {
      result.current.handleClick(cell(15, 1)); // salto no coincide desde el último válido
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onFinish).toHaveBeenCalled();
    expect(result.current.currentScore).toBe(999);
  });
});
