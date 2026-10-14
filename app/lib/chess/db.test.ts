import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/scores/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/app/lib/scores/db";
import { createFakeRowStore } from "@/app/lib/testHelpers/fakeRowStore";
import { consumeChessGame } from "./db";

const CREATED_AT = 1_700_000_000_000;
const NONCE_MAX_AGE_MS = 60 * 60 * 1000;

function makeRow(overrides: Partial<{ userId: string; elo: number; moves: string; createdAt: number }> = {}) {
  return {
    userId: "user-1",
    elo: 1200,
    moves: JSON.stringify(["e2e4"]),
    createdAt: CREATED_AT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(CREATED_AT);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("consumeChessGame", () => {
  it("returns null if the nonce does not exist", async () => {
    const store = createFakeRowStore<ReturnType<typeof makeRow>>({});
    vi.mocked(getDb).mockResolvedValue(store as any);

    expect(await consumeChessGame("missing")).toBeNull();
  });

  it("reads and deletes the nonce, returning the parsed moves", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    const result = await consumeChessGame("n1");

    expect(result).toEqual({
      userId: "user-1",
      elo: 1200,
      moves: ["e2e4"],
      movesJson: JSON.stringify(["e2e4"]),
      createdAt: CREATED_AT,
    });
    expect(store.rows.has("n1")).toBe(false);
  });

  it("a second consume of the same, already deleted nonce returns null", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    await consumeChessGame("n1");
    expect(await consumeChessGame("n1")).toBeNull();
  });

  // Same as numbers/tetris/words: two concurrent /api/scores calls with the
  // same nonce must not be able to score the same game twice.
  it("of two concurrent consumes of the same nonce, only one succeeds", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    const [first, second] = await Promise.all([
      consumeChessGame("n1"),
      consumeChessGame("n1"),
    ]);

    const successes = [first, second].filter((r) => r !== null);
    expect(successes).toHaveLength(1);
  });

  it("a nonce exactly at the expiry limit (== MAX_AGE) does not count as expired yet", async () => {
    const store = createFakeRowStore({ n1: makeRow({ createdAt: CREATED_AT }) });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS);

    expect(await consumeChessGame("n1")).not.toBeNull();
  });

  it("a nonce one instant past the expiry limit counts as expired and is deleted", async () => {
    const store = createFakeRowStore({ n1: makeRow({ createdAt: CREATED_AT }) });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS + 1);

    expect(await consumeChessGame("n1")).toBeNull();
    expect(store.rows.has("n1")).toBe(false);
  });
});
