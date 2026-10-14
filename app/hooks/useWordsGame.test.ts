// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROUNDS_TOTAL, useWordsGame } from "./useWordsGame";

// preloadAudio() uses `new Audio()`, which jsdom doesn't really implement. We
// replace it with a stub that fires "canplaythrough" synchronously in
// load(), so rounds are preloaded instantly in the tests.
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
  it("starts in idle", () => {
    const { result } = renderHook(() => useWordsGame());
    expect(result.current.gameState).toBe("idle");
    expect(result.current.round).toBeUndefined();
  });

  it("startGame loads the rounds and switches to 'playing'", async () => {
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

  it("startGame calls onReset when starting", async () => {
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

  it("startGame goes back to 'idle' if the server fails", async () => {
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

  it("a correct handleChoice advances to the next round after the feedback pause", async () => {
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
    expect(result.current.currentRound).toBe(0); // hasn't advanced yet, waits for the timeout

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.feedback).toBeNull();
    expect(result.current.score).toBe(1);
    expect(result.current.currentRound).toBe(1);
    expect(result.current.gameState).toBe("playing");
  });

  it("a wrong handleChoice ends the game as lost and still saves the score", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/words/new-game": () =>
          jsonResponse({ nonce: "nonce-1", rounds: makeRounds(ROUNDS_TOTAL) }),
        "POST /bookmarks/api/words/answer": () =>
          jsonResponse({ correct: false, target: "correcta" }),
      })
    );
    const onComplete = vi.fn().mockResolvedValue({ score: 42, rank: 7, total: 20 });

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
    expect(onComplete).toHaveBeenCalledWith("nonce-1");
    expect(result.current.finishedScore).toBe(42);
    expect(result.current.finishedRank).toBe(7);
    expect(result.current.finishedTotal).toBe(20);
  });

  it("the last correct round calls onComplete and adopts its result", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/words/new-game": () =>
          jsonResponse({ nonce: "nonce-1", rounds: makeRounds(ROUNDS_TOTAL) }),
        "POST /bookmarks/api/words/answer": () => jsonResponse({ correct: true, finished: true }),
      })
    );
    const onComplete = vi.fn().mockResolvedValue({ score: 12345, rank: 3, total: 50 });

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
    expect(result.current.finishedScore).toBe(12345);
    expect(result.current.finishedRank).toBe(3);
    expect(result.current.finishedTotal).toBe(50);
  });

  it("handleQuit ends the game in progress without marking it as won", async () => {
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

  it("handleQuit does nothing if there's no game in progress", () => {
    const { result } = renderHook(() => useWordsGame());

    act(() => {
      result.current.handleQuit();
    });

    expect(result.current.gameState).toBe("idle");
    expect(result.current.quit).toBe(false);
  });
});
