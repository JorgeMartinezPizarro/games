import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/scores/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/app/lib/scores/db";
import { createFakeRowStore } from "@/app/lib/testHelpers/fakeRowStore";
import { consumeWordsGame } from "./db";

const CREATED_AT = 1_700_000_000_000;
const NONCE_MAX_AGE_MS = 15 * 60 * 1000;

function makeRow(
  overrides: Partial<{ userId: string; rounds: string; answeredCount: number; ended: number; createdAt: number }> = {}
) {
  return {
    userId: "user-1",
    rounds: JSON.stringify([{ target: "hola", audio: "/a.mp3", choices: ["hola", "adios"] }]),
    answeredCount: 1,
    ended: 0,
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

describe("consumeWordsGame", () => {
  it("devuelve null si el nonce no existe", async () => {
    const store = createFakeRowStore<ReturnType<typeof makeRow>>({});
    vi.mocked(getDb).mockResolvedValue(store as any);

    expect(await consumeWordsGame("missing")).toBeNull();
  });

  it("lee y borra el nonce, devolviendo el estado parseado", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    const result = await consumeWordsGame("n1");

    expect(result).toEqual({
      userId: "user-1",
      rounds: [{ target: "hola", audio: "/a.mp3", choices: ["hola", "adios"] }],
      answeredCount: 1,
      ended: false,
      createdAt: CREATED_AT,
    });
    expect(store.rows.has("n1")).toBe(false);
  });

  it("un segundo consumo del mismo nonce ya borrado devuelve null", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    await consumeWordsGame("n1");
    expect(await consumeWordsGame("n1")).toBeNull();
  });

  it("de dos consumos concurrentes del mismo nonce, solo uno tiene éxito", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    const [first, second] = await Promise.all([
      consumeWordsGame("n1"),
      consumeWordsGame("n1"),
    ]);

    const successes = [first, second].filter((r) => r !== null);
    expect(successes).toHaveLength(1);
  });

  it("nonce justo en el límite de expiración (== MAX_AGE) todavía no cuenta como expirado", async () => {
    const store = createFakeRowStore({ n1: makeRow({ createdAt: CREATED_AT }) });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS);

    expect(await consumeWordsGame("n1")).not.toBeNull();
  });

  it("nonce un instante después del límite de expiración cuenta como expirado y se borra", async () => {
    const store = createFakeRowStore({ n1: makeRow({ createdAt: CREATED_AT }) });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS + 1);

    expect(await consumeWordsGame("n1")).toBeNull();
    expect(store.rows.has("n1")).toBe(false);
  });
});
