import { vi } from "vitest";

// Mock mínimo de un pool mysql2/promise que modela una única tabla
// clave-valor indexada por nonce (la forma de game_chess/numbers_games/
// tetris_games/words_games), con la misma semántica de una fila real: un
// DELETE por clave primaria solo afecta una fila la primera vez que se
// ejecuta para ese nonce, igual que haría InnoDB con el locking de una fila
// por su PK. Sirve para reproducir de forma determinista, con Promise.all,
// la carrera SELECT-luego-DELETE de dos peticiones "concurrentes" sobre el
// mismo nonce sin necesitar una MariaDB real: ambas ven la fila en su
// SELECT si ninguna ha borrado aún, pero solo una de las dos DELETE llega a
// afectar una fila.
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
