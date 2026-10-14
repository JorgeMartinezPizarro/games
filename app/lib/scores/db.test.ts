import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// db.ts had never been tested directly: getDb()/mysql2 was always fully
// mocked in the route tests. Here only mysql2/promise (createPool) is
// mocked, so we can inspect the real SQL each function builds, without
// needing an actual MariaDB.
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
  it("sorts ASC (lower score = better) for tetris (gameId 3)", async () => {
    await getScoresForGame(3);

    const [sql] = executeMock.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toMatch(/ORDER BY s\.score ASC/);
    expect(sql).toMatch(/LIMIT 100/);
  });

  it("sorts DESC (higher score = better) for chess, numbers and words", async () => {
    for (const gameId of [1, 2, 4] as const) {
      executeMock.mockClear();
      await getScoresForGame(gameId);

      const [sql] = executeMock.mock.calls.at(-1) as [string, unknown[]];
      expect(sql).toMatch(/ORDER BY s\.score DESC/);
    }
  });
});

describe("getScoreRank", () => {
  it("looks up the rank/total of ONE specific row (by id), sorting ASC for tetris", async () => {
    executeMock.mockResolvedValueOnce([[{ rank: 4, total: 12 }]]);

    const result = await getScoreRank(3, 77);

    expect(result).toEqual({ rank: 4, total: 12 });
    const [sql, params] = executeMock.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toMatch(/ORDER BY score ASC/);
    expect(sql).not.toMatch(/WHERE userId/);
    expect(params).toEqual([3, 77]);
  });

  it("sorts DESC for the rest of the games", async () => {
    executeMock.mockResolvedValueOnce([[{ rank: 1, total: 1 }]]);

    await getScoreRank(1, 5);

    const [sql] = executeMock.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toMatch(/ORDER BY score DESC/);
  });

  it("throws if the inserted row does not appear in the result (broken invariant)", async () => {
    executeMock.mockResolvedValueOnce([[]]);

    await expect(getScoreRank(3, 999)).rejects.toThrow(/not found/);
  });
});

describe("insertScore", () => {
  it("creates/updates the user and then inserts the score row", async () => {
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
