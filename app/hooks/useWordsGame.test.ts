// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROUNDS_TOTAL, useWordsGame } from "./useWordsGame";

// preloadAudio() usa `new Audio()`, que jsdom no implementa de verdad. La
// sustituimos por un stub que dispara "canplaythrough" de forma síncrona en
// load(), así las rondas se precargan al instante en los tests.
class ImmediateAudio {
  preload = "";
  src = "";
  currentTime = 0;
  private canPlayHandler: (() => void) | null = null;

  addEventListener(event: string, handler: () => void) {
    if (event === "canplaythrough") this.canPlayHandler = handler;
  }
  removeEventListener() {}
  load() {
    this.canPlayHandler?.();
  }
  play() {
    return Promise.resolve();
  }
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

function makeRounds(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    audio: `/audio/${i}.mp3`,
    choices: ["a", "b", "c", "d"],
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Audio", ImmediateAudio as unknown as typeof Audio);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useWordsGame", () => {
  it("empieza en idle", () => {
    const { result } = renderHook(() => useWordsGame());
    expect(result.current.gameState).toBe("idle");
    expect(result.current.round).toBeUndefined();
  });

  it("startGame carga las rondas y pasa a 'playing'", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/words/new-game": () =>
          jsonResponse({ nonce: "nonce-1", rounds: makeRounds(ROUNDS_TOTAL) }),
      })
    );

    const { result } = renderHook(() => useWordsGame());

    await act(async () => {
      await result.current.startGame();
    });

    expect(result.current.gameState).toBe("playing");
    expect(result.current.round).toEqual({ audio: "/audio/0.mp3", choices: ["a", "b", "c", "d"] });
    expect(result.current.currentRound).toBe(0);
    expect(result.current.score).toBe(0);
  });

  it("startGame llama a onReset al arrancar", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/words/new-game": () =>
          jsonResponse({ nonce: "nonce-1", rounds: makeRounds(ROUNDS_TOTAL) }),
      })
    );
    const onReset = vi.fn();
    const { result } = renderHook(() => useWordsGame({ onReset }));

    await act(async () => {
      await result.current.startGame();
    });

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("startGame vuelve a 'idle' si el servidor falla", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/words/new-game": () => jsonResponse({ error: "boom" }, false),
      })
    );

    const { result } = renderHook(() => useWordsGame());

    await act(async () => {
      await result.current.startGame();
    });

    expect(result.current.gameState).toBe("idle");
  });

  it("handleChoice correcta avanza de ronda tras la pausa de feedback", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/words/new-game": () =>
          jsonResponse({ nonce: "nonce-1", rounds: makeRounds(ROUNDS_TOTAL) }),
        "POST /bookmarks/api/words/answer": () => jsonResponse({ correct: true, finished: false }),
      })
    );

    const { result } = renderHook(() => useWordsGame());
    await act(async () => {
      await result.current.startGame();
    });

    await act(async () => {
      await result.current.handleChoice("a");
    });
    expect(result.current.feedback).toBe("correct");
    expect(result.current.currentRound).toBe(0); // aún no avanzó, espera el timeout

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.feedback).toBeNull();
    expect(result.current.score).toBe(1);
    expect(result.current.currentRound).toBe(1);
    expect(result.current.gameState).toBe("playing");
  });

  it("handleChoice incorrecta termina la partida como perdida, sin guardar score", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/words/new-game": () =>
          jsonResponse({ nonce: "nonce-1", rounds: makeRounds(ROUNDS_TOTAL) }),
        "POST /bookmarks/api/words/answer": () =>
          jsonResponse({ correct: false, target: "correcta" }),
      })
    );
    const onComplete = vi.fn();

    const { result } = renderHook(() => useWordsGame({ onComplete }));
    await act(async () => {
      await result.current.startGame();
    });

    await act(async () => {
      await result.current.handleChoice("b");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.gameState).toBe("finished");
    expect(result.current.won).toBe(false);
    expect(result.current.quit).toBe(false);
    expect(result.current.finishedTime).toBeGreaterThanOrEqual(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("la última ronda correcta llama a onComplete y adopta su resultado", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/words/new-game": () =>
          jsonResponse({ nonce: "nonce-1", rounds: makeRounds(ROUNDS_TOTAL) }),
        "POST /bookmarks/api/words/answer": () => jsonResponse({ correct: true, finished: true }),
      })
    );
    const onComplete = vi.fn().mockResolvedValue({ score: 12345, rank: 3 });

    const { result } = renderHook(() => useWordsGame({ onComplete }));
    await act(async () => {
      await result.current.startGame();
    });

    await act(async () => {
      await result.current.handleChoice("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(onComplete).toHaveBeenCalledWith("nonce-1");
    expect(result.current.gameState).toBe("finished");
    expect(result.current.won).toBe(true);
    expect(result.current.score).toBe(1);
    expect(result.current.finishedTime).toBe(12345);
    expect(result.current.finishedRank).toBe(3);
  });

  it("handleQuit termina la partida en curso sin marcarla como ganada", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/words/new-game": () =>
          jsonResponse({ nonce: "nonce-1", rounds: makeRounds(ROUNDS_TOTAL) }),
      })
    );
    const onComplete = vi.fn();

    const { result } = renderHook(() => useWordsGame({ onComplete }));
    await act(async () => {
      await result.current.startGame();
    });

    act(() => {
      result.current.handleQuit();
    });

    expect(result.current.gameState).toBe("finished");
    expect(result.current.quit).toBe(true);
    expect(result.current.won).toBe(false);
    expect(result.current.finishedTime).toBeGreaterThanOrEqual(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("handleQuit no hace nada si no hay partida en curso", () => {
    const { result } = renderHook(() => useWordsGame());

    act(() => {
      result.current.handleQuit();
    });

    expect(result.current.gameState).toBe("idle");
    expect(result.current.quit).toBe(false);
  });
});
