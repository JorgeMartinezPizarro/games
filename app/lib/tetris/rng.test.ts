import { describe, expect, it, vi } from "vitest";
import { createPieceGenerator, randomSeed } from "./rng";
import { TETROMINOS } from "./engine";

describe("createPieceGenerator", () => {
  it("la misma seed produce siempre la misma secuencia de piezas", () => {
    const gen1 = createPieceGenerator(12345);
    const gen2 = createPieceGenerator(12345);

    const seq1 = Array.from({ length: 50 }, () => gen1());
    const seq2 = Array.from({ length: 50 }, () => gen2());

    expect(seq1).toEqual(seq2);
  });

  it("seeds distintas producen (con altísima probabilidad) secuencias distintas", () => {
    const gen1 = createPieceGenerator(1);
    const gen2 = createPieceGenerator(2);

    const seq1 = Array.from({ length: 20 }, () => gen1());
    const seq2 = Array.from({ length: 20 }, () => gen2());

    expect(seq1).not.toEqual(seq2);
  });

  it("solo devuelve piezas del set TETROMINOS", () => {
    const gen = createPieceGenerator(999);
    const pieces = Array.from({ length: 100 }, () => gen());

    for (const piece of pieces) {
      expect(TETROMINOS).toContainEqual(piece);
    }
  });

  it("es estable frente a seeds negativas o fuera de rango de 32 bits (se normalizan con >>> 0)", () => {
    const gen1 = createPieceGenerator(-1);
    const gen2 = createPieceGenerator(-1);

    const seq1 = Array.from({ length: 10 }, () => gen1());
    const seq2 = Array.from({ length: 10 }, () => gen2());

    expect(seq1).toEqual(seq2);
  });
});

describe("randomSeed", () => {
  it("devuelve un entero de 32 bits sin signo", () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });

  it("dos llamadas seguidas no producen la misma seed (con altísima probabilidad)", () => {
    const seeds = new Set(Array.from({ length: 20 }, () => randomSeed()));
    expect(seeds.size).toBeGreaterThan(1);
  });

  it("no depende únicamente de Date.now(): con el reloj congelado, sigue variando", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const seeds = new Set(Array.from({ length: 20 }, () => randomSeed()));

    vi.useRealTimers();
    expect(seeds.size).toBeGreaterThan(1);
  });
});
