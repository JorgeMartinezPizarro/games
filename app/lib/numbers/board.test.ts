import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boardsMatch,
  computeNumbersScore,
  generateBoard,
  hasSolution,
  validateMoves,
} from "./board";
import type { CellValues } from "@/app/types";

function cell(n: number, i: number): CellValues {
  return { values: { n, b: false, i } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateMoves — límites", () => {
  // Tablero de 4 casillas con jump=1 en todas: cualquier vecino inmediato es
  // un movimiento legal, así que cabe recorrerlo entero (4 movimientos).
  const board = [cell(1, 0), cell(1, 1), cell(1, 2), cell(1, 3)];

  it("acepta exactamente board.length movimientos (recorrido completo)", () => {
    const moves = [
      { i: 0, t: 0 },
      { i: 1, t: 10 },
      { i: 2, t: 20 },
      { i: 3, t: 30 },
    ];
    const result = validateMoves(board, moves, 1000);
    expect(result).toEqual({ valid: true, steps: 4 });
  });

  it("rechaza board.length + 1 movimientos como 'Too many moves'", () => {
    const moves = [
      { i: 0, t: 0 },
      { i: 1, t: 10 },
      { i: 2, t: 20 },
      { i: 3, t: 30 },
      { i: 0, t: 40 }, // repetida, pero ya sobra por longitud antes de mirar contenido
    ];
    const result = validateMoves(board, moves, 1000);
    expect(result).toEqual({ valid: false, reason: "Too many moves." });
  });

  it("tablero de una sola casilla: jump=0, el único movimiento posible es quedarse en ella", () => {
    const single = [cell(0, 0)];
    const result = validateMoves(single, [{ i: 0, t: 0 }], 1000);
    expect(result).toEqual({ valid: true, steps: 1 });
  });

  it("rechaza un índice de celda no entero (coerción de string no numérico)", () => {
    const result = validateMoves(board, [{ i: "abc", t: 0 }], 1000);
    expect(result).toEqual({ valid: false, reason: "Malformed move." });
  });

  it("rechaza un índice fuera de rango", () => {
    const result = validateMoves(board, [{ i: 4, t: 0 }], 1000);
    expect(result).toEqual({ valid: false, reason: "Invalid cell index." });
  });

  it("rechaza un timestamp más allá de elapsedMs + tolerancia de reloj", () => {
    const result = validateMoves(board, [{ i: 0, t: 5000 }], 1000);
    expect(result).toEqual({ valid: false, reason: "Move timestamp out of range." });
  });

  it("acepta un timestamp justo en el límite de tolerancia (elapsedMs + 2000ms)", () => {
    const result = validateMoves(board, [{ i: 0, t: 3000 }], 1000);
    expect(result).toEqual({ valid: true, steps: 1 });
  });
});

describe("computeNumbersScore — casos límite", () => {
  it("steps=0 devuelve 0 (no hay partida)", () => {
    expect(computeNumbersScore(0, 5000)).toBe(0);
  });

  it("elapsedMs=0 o negativo devuelve 0", () => {
    expect(computeNumbersScore(5, 0)).toBe(0);
    expect(computeNumbersScore(5, -100)).toBe(0);
  });

  it("un ritmo por debajo del suelo (MIN_MS_PER_STEP) no aumenta el score: resolverlo más rápido no suma más", () => {
    const atFloor = computeNumbersScore(10, 1500); // 150ms/paso exacto
    const fasterThanFloor = computeNumbersScore(10, 100); // 10ms/paso, por debajo del suelo
    expect(fasterThanFloor).toBe(atFloor);
  });
});

describe("boardsMatch", () => {
  const board = [cell(2, 0), cell(3, 1)];

  it("compara solo el campo n de cada celda, no b/i", () => {
    expect(boardsMatch(board, [{ values: { n: 2 } }, { values: { n: 3 } }])).toBe(true);
  });

  it("rechaza longitudes distintas o payloads no-array", () => {
    expect(boardsMatch(board, [{ values: { n: 2 } }])).toBe(false);
    expect(boardsMatch(board, "not-an-array")).toBe(false);
  });
});

describe("generateBoard — fallback tras 200 intentos sin solución", () => {
  // Con length=2, un jump PAR (2, 4 o 6) en ambas celdas hace que
  // (pos±jump) % 2 == pos siempre: no hay forma de visitar la otra celda,
  // así que hasSolution es false pase lo que pase. Forzando Math.random a
  // un valor fijo (que floor(x*5)+2 = 2 en randomArrayCellValues), CADA
  // regeneración produce el mismo tablero sin solución: generateBoard debe
  // agotar los 200 intentos y aun así devolver ese tablero (documentando el
  // caso "no se garantiza un tablero resoluble" en vez de colgarse).
  it("agota los 200 intentos y devuelve igualmente un tablero (potencialmente sin solución)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // floor(0*5)+2 = 2 (par) en toda celda

    const board = generateBoard(2);

    expect(board).toHaveLength(2);
    expect(hasSolution(board)).toBe(false);
    // 1 intento inicial + 200 reintentos, 2 celdas cada vez.
    expect(Math.random).toHaveBeenCalledTimes(201 * 2);
  });

  it("con una solución alcanzable a la primera, no reintenta 200 veces", () => {
    // n=2 en índice par sirve solo de ejemplo; usamos el generador real (sin
    // mockear Math.random) y confiamos en que casi cualquier tablero de
    // BOARD_SIZE (20) tiene solución en la práctica.
    const randomSpy = vi.spyOn(Math, "random");
    generateBoard(20);
    expect(randomSpy.mock.calls.length).toBeLessThan(201 * 20);
  });
});
