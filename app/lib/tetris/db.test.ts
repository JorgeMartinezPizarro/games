import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/scores/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/app/lib/scores/db";
import { createFakeRowStore } from "@/app/lib/testHelpers/fakeRowStore";
import { consumeTetrisGame } from "./db";

const CREATED_AT = 1_700_000_000_000;
const NONCE_MAX_AGE_MS = 30 * 60 * 1000;

function makeRow(overrides: Partial<{ userId: string; seed: number; createdAt: number }> = {}) {
  return { userId: "user-1", seed: 42, createdAt: CREATED_AT, ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(CREATED_AT);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("consumeTetrisGame", () => {
  it("devuelve null si el nonce no existe", async () => {
    const store = createFakeRowStore<ReturnType<typeof makeRow>>({});
    vi.mocked(getDb).mockResolvedValue(store as any);

    expect(await consumeTetrisGame("missing")).toBeNull();
  });

  it("lee y borra el nonce, devolviendo el seed", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    const result = await consumeTetrisGame("n1");

    expect(result).toEqual({ userId: "user-1", seed: 42, createdAt: CREATED_AT });
    expect(store.rows.has("n1")).toBe(false);
  });

  it("un segundo consumo del mismo nonce ya borrado devuelve null", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    await consumeTetrisGame("n1");
    expect(await consumeTetrisGame("n1")).toBeNull();
  });

  it("de dos consumos concurrentes del mismo nonce, solo uno tiene éxito", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    const [first, second] = await Promise.all([
      consumeTetrisGame("n1"),
      consumeTetrisGame("n1"),
    ]);

    const successes = [first, second].filter((r) => r !== null);
    expect(successes).toHaveLength(1);
  });

  it("nonce justo en el límite de expiración (== MAX_AGE) todavía no cuenta como expirado", async () => {
    const store = createFakeRowStore({ n1: makeRow({ createdAt: CREATED_AT }) });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS);

    expect(await consumeTetrisGame("n1")).not.toBeNull();
  });

  it("nonce un instante después del límite de expiración cuenta como expirado y se borra", async () => {
    const store = createFakeRowStore({ n1: makeRow({ createdAt: CREATED_AT }) });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS + 1);

    expect(await consumeTetrisGame("n1")).toBeNull();
    expect(store.rows.has("n1")).toBe(false);
  });
});
