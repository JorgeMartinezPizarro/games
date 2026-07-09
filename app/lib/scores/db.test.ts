import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// db.ts nunca se había probado directamente: getDb()/mysql2 siempre se
// mockeaba por completo en los tests de las rutas. Aquí se mockea solo
// mysql2/promise (createPool) para poder inspeccionar el SQL real que
// construye cada función, sin necesitar una MariaDB de verdad.
const executeMock = vi.fn().mockResolvedValue([[]]);
const queryMock = vi.fn().mockResolvedValue([[]]);

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: () => ({
      query: queryMock,
      execute: executeMock,
    }),
  },
}));

import { getScoreRank, getScoresForGame, insertScore } from "./db";

beforeEach(() => {
  executeMock.mockClear();
  executeMock.mockResolvedValue([[]]);
  queryMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getScoresForGame", () => {
  it("ordena ASC (menor score = mejor) para tetris (gameId 3)", async () => {
    await getScoresForGame(3);

    const [sql] = executeMock.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toMatch(/ORDER BY s\.score ASC/);
    expect(sql).toMatch(/LIMIT 100/);
  });

  it("ordena DESC (mayor score = mejor) para chess, numbers y words", async () => {
    for (const gameId of [1, 2, 4] as const) {
      executeMock.mockClear();
      await getScoresForGame(gameId);

      const [sql] = executeMock.mock.calls.at(-1) as [string, unknown[]];
      expect(sql).toMatch(/ORDER BY s\.score DESC/);
    }
  });
});

describe("getScoreRank", () => {
  it("busca el rank/total de UNA fila concreta (por id), ordenando ASC para tetris", async () => {
    executeMock.mockResolvedValueOnce([[{ rank: 4, total: 12 }]]);

    const result = await getScoreRank(3, 77);

    expect(result).toEqual({ rank: 4, total: 12 });
    const [sql, params] = executeMock.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toMatch(/ORDER BY score ASC/);
    expect(sql).not.toMatch(/WHERE userId/);
    expect(params).toEqual([3, 77]);
  });

  it("ordena DESC para el resto de juegos", async () => {
    executeMock.mockResolvedValueOnce([[{ rank: 1, total: 1 }]]);

    await getScoreRank(1, 5);

    const [sql] = executeMock.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toMatch(/ORDER BY score DESC/);
  });

  it("lanza si la fila insertada no aparece en el resultado (invariante rota)", async () => {
    executeMock.mockResolvedValueOnce([[]]);

    await expect(getScoreRank(3, 999)).rejects.toThrow(/not found/);
  });
});

describe("insertScore", () => {
  it("crea/actualiza el usuario y luego inserta la fila de score", async () => {
    executeMock.mockResolvedValueOnce([{}]); // ensureUser INSERT ... ON DUPLICATE KEY
    executeMock.mockResolvedValueOnce([{ insertId: 42 }]); // INSERT INTO scores

    const id = await insertScore(
      { id: "user-1", name: "Test", email: "t@t.com" },
      3,
      37_000,
      JSON.stringify({ linesTarget: 25 })
    );

    expect(id).toBe(42);
    expect(executeMock).toHaveBeenCalledTimes(2);

    const [scoreSql, scoreParams] = executeMock.mock.calls[1];
    expect(scoreSql).toMatch(/INSERT INTO scores/);
    expect(scoreParams).toEqual([3, "user-1", "Test", 37_000, JSON.stringify({ linesTarget: 25 })]);
  });
});
