import { vi } from "vitest";

// Minimal mock of a mysql2/promise pool that models a single key-value
// table indexed by nonce (the shape of game_chess/numbers_games/
// tetris_games/words_games), with the same semantics as a real row: a
// DELETE by primary key only affects a row the first time it runs for that
// nonce, just as InnoDB would with row locking on its PK. It lets the
// SELECT-then-DELETE race of two "concurrent" requests on the same nonce
// be reproduced deterministically with Promise.all, without needing a real
// MariaDB: both see the row in their SELECT if neither has deleted it yet,
// but only one of the two DELETEs actually affects a row.
export function createFakeRowStore<Row extends Record<string, unknown>>(
  initialRows: Record<string, Row> = {}
) {
  const rows = new Map(Object.entries(initialRows));

  async function execute(sql: string, params: unknown[] = []): Promise<[unknown, unknown]> {
    const nonce = params[params.length - 1] as string;

    if (/^\s*SELECT/i.test(sql)) {
      const row = rows.get(nonce);
      return [row ? [row] : [], []];
    }
    if (/^\s*DELETE/i.test(sql)) {
      const existed = rows.delete(nonce);
      return [{ affectedRows: existed ? 1 : 0 }, []];
    }
    throw new Error(`createFakeRowStore: unsupported SQL in this fake: ${sql}`);
  }

  return {
    rows,
    query: vi.fn().mockResolvedValue([[]]), // CREATE TABLE IF NOT EXISTS
    execute: vi.fn(execute),
  };
}
