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
  it("devuelve null si el nonce no existe", async () => {
    const store = createFakeRowStore<ReturnType<typeof makeRow>>({});
    vi.mocked(getDb).mockResolvedValue(store as any);

    expect(await consumeNumbersGame("missing")).toBeNull();
  });

  it("lee y borra el nonce, devolviendo el tablero parseado", async () => {
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

  it("un segundo consumo del mismo nonce ya borrado devuelve null", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    await consumeNumbersGame("n1");
    expect(await consumeNumbersGame("n1")).toBeNull();
  });

  // Dos peticiones "concurrentes" para el mismo nonce (p.ej. doble-click o un
  // reintento de red que dispara /api/scores dos veces): ambas ven la fila
  // en su SELECT antes de que ninguna borre, pero solo la que de verdad
  // ejecuta el DELETE que afecta una fila debe devolver la partida — la otra
  // debe tratarse como "nonce ya usado", no puntuar la misma partida dos veces.
  it("de dos consumos concurrentes del mismo nonce, solo uno tiene éxito", async () => {
    const store = createFakeRowStore({ n1: makeRow() });
    vi.mocked(getDb).mockResolvedValue(store as any);

    const [first, second] = await Promise.all([
      consumeNumbersGame("n1"),
      consumeNumbersGame("n1"),
    ]);

    const successes = [first, second].filter((r) => r !== null);
    expect(successes).toHaveLength(1);
  });

  it("nonce justo en el límite de expiración (== MAX_AGE) todavía no cuenta como expirado", async () => {
    const store = createFakeRowStore({
      n1: makeRow({ createdAt: CREATED_AT }),
    });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS);

    expect(await consumeNumbersGame("n1")).not.toBeNull();
  });

  it("nonce un instante después del límite de expiración cuenta como expirado", async () => {
    const store = createFakeRowStore({
      n1: makeRow({ createdAt: CREATED_AT }),
    });
    vi.mocked(getDb).mockResolvedValue(store as any);
    vi.setSystemTime(CREATED_AT + NONCE_MAX_AGE_MS + 1);

    expect(await consumeNumbersGame("n1")).toBeNull();
    // Aun expirado, la fila se borra (no deja huérfanos ni permite reintentar).
    expect(store.rows.has("n1")).toBe(false);
  });
});
