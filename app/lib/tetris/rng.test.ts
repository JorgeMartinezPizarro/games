import { describe, expect, it, vi } from "vitest";
import { createPieceGenerator, randomSeed } from "./rng";
import { TETROMINOS } from "./engine";

describe("createPieceGenerator", () => {
  it("the same seed always produces the same piece sequence", () => {
    const gen1 = createPieceGenerator(12345);
    const gen2 = createPieceGenerator(12345);

    const seq1 = Array.from({ length: 50 }, () => gen1());
    const seq2 = Array.from({ length: 50 }, () => gen2());

    expect(seq1).toEqual(seq2);
  });

  it("different seeds produce (with very high probability) different sequences", () => {
    const gen1 = createPieceGenerator(1);
    const gen2 = createPieceGenerator(2);

    const seq1 = Array.from({ length: 20 }, () => gen1());
    const seq2 = Array.from({ length: 20 }, () => gen2());

    expect(seq1).not.toEqual(seq2);
  });

  it("only returns pieces from the TETROMINOS set", () => {
    const gen = createPieceGenerator(999);
    const pieces = Array.from({ length: 100 }, () => gen());

    for (const piece of pieces) {
      expect(TETROMINOS).toContainEqual(piece);
    }
  });

  it("is stable for negative or out-of-32-bit-range seeds (they are normalized with >>> 0)", () => {
    const gen1 = createPieceGenerator(-1);
    const gen2 = createPieceGenerator(-1);

    const seq1 = Array.from({ length: 10 }, () => gen1());
    const seq2 = Array.from({ length: 10 }, () => gen2());

    expect(seq1).toEqual(seq2);
  });
});

describe("randomSeed", () => {
  it("returns an unsigned 32-bit integer", () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });

  it("two consecutive calls don't produce the same seed (with very high probability)", () => {
    const seeds = new Set(Array.from({ length: 20 }, () => randomSeed()));
    expect(seeds.size).toBeGreaterThan(1);
  });

  it("does not depend solely on Date.now(): with the clock frozen, it still varies", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const seeds = new Set(Array.from({ length: 20 }, () => randomSeed()));

    vi.useRealTimers();
    expect(seeds.size).toBeGreaterThan(1);
  });
});
