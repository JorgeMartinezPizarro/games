import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/scores/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/app/lib/scores/db";
import { createFakeRowStore } from "@/app/lib/testHelpers/fakeRowStore";
import { consumeNumbersGame } from "./db";

const CREATED_AT = 1_700_000_000_000;
const NONCE_MAX_AGE_MS = 15 * 60 * 1000;

function makeRow(overrides: Partial<{ userId: string; board: string; createdAt: number }> = {}) {
  return {
    userId: "user-1",
    board: JSON.stringify([{ values: { n: 3, b: false, i: 0 } }]),
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

describe("consumeNumbersGame", () => {
  it("returns null if the nonce does not exist", async () => {
    const store = createFakeRowStore<ReturnType<typeof makeRow>>({});
    vi.mocked(getDb).mockResolvedValue(store as any);

    expect(await consumeNumbersGame("missing")).toBeNull();
  });

  it("reads and deletes the nonce, returning the parsed board", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    const result = await consumeNumbersGame("n1");

    expect(result).toEqual({
      userId: "user-1",
      board: [{ values: { n: 3, b: false, i: 0 } }],
      createdAt: CREATED_AT,
    });
    expect(store.rows.has("n1")).toBe(false);
  });

  it("a second consume of the same, already deleted nonce returns null", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    await consumeNumbersGame("n1");
    expect(await consumeNumbersGame("n1")).toBeNull();
  });

  // Two "concurrent" requests for the same nonce (e.g. a double click or a
  // network retry that fires /api/scores twice): both see the row in their
  // SELECT before either one deletes it, but only the one whose DELETE
  // actually affects a row must return the game — the other must be treated
  // as "nonce already used", not score the same game twice.
  it("of two concurrent consumes of the same nonce, only one succeeds", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    const [first, second] = await Promise.all([
      consumeNumbersGame("n1"),
      consumeNumbersGame("n1"),
    ]);

    const successes = [first, second].filter((r) => r !== null);
    expect(successes).toHaveLength(1);
  });

  it("a nonce exactly at the expiry limit (== MAX_AGE) does not count as expired yet", async () => {
    const store = createFakeRowStore({
      n1: makeRow({ createdAt: CREATED_AT }),
    });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS);

    expect(await consumeNumbersGame("n1")).not.toBeNull();
  });

  it("a nonce one instant past the expiry limit counts as expired", async () => {
    const store = createFakeRowStore({
      n1: makeRow({ createdAt: CREATED_AT }),
    });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS + 1);

    expect(await consumeNumbersGame("n1")).toBeNull();
    // Even when expired, the row is deleted (leaves no orphans and allows no retries).
    expect(store.rows.has("n1")).toBe(false);
  });
});
