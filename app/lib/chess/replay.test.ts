import { describe, expect, it } from "vitest";
import { MAX_PLIES, replayChessMoves, uciMoveToParts } from "./replay";
import { THREEFOLD_REPETITION_DRAW } from "./testFixtures";

describe("uciMoveToParts", () => {
  it("acepta jugadas de 4 y 5 caracteres (con promoción)", () => {
    expect(uciMoveToParts("e2e4")).toEqual({ from: "e2", to: "e4", promotion: undefined });
    expect(uciMoveToParts("a7a8q")).toEqual({ from: "a7", to: "a8", promotion: "q" });
  });

  it("rechaza longitudes distintas de 4/5 y valores no-string", () => {
    expect(uciMoveToParts("e2e")).toBeNull();
    expect(uciMoveToParts("e2e44q")).toBeNull();
    expect(uciMoveToParts(123)).toBeNull();
    expect(uciMoveToParts(null)).toBeNull();
  });
});

describe("replayChessMoves", () => {
  it("partida en tablas por triple repetición: gameOver true pero no es checkmate", () => {
    const replay = replayChessMoves(THREEFOLD_REPETITION_DRAW);

    expect(replay.valid).toBe(true);
    if (!replay.valid) return;
    expect(replay.gameOver).toBe(true);
    expect(replay.chess.isCheckmate()).toBe(false);
    expect(replay.chess.isThreefoldRepetition()).toBe(true);
    // Ninguna partida en tablas debe poder puntuar como victoria del jugador.
    const playerWon = replay.chess.isCheckmate() && replay.chess.turn() === "b";
    expect(playerWon).toBe(false);
  });

  it("exactamente MAX_PLIES jugadas no se rechaza por longitud (falla más adelante, por ilegalidad)", () => {
    const moves = new Array(MAX_PLIES).fill("a1a1"); // ilegal desde la 1ª jugada, pero de longitud válida
    const replay = replayChessMoves(moves);

    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).toMatch(/Illegal move in recorded history/);
  });

  it("MAX_PLIES + 1 jugadas se rechaza directamente por longitud", () => {
    const moves = new Array(MAX_PLIES + 1).fill("a1a1");
    const replay = replayChessMoves(moves);

    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).toMatch(/Malformed or too-long move log/);
  });

  it("partida vacía: válida, tablero inicial, no terminada", () => {
    const replay = replayChessMoves([]);

    expect(replay.valid).toBe(true);
    if (!replay.valid) return;
    expect(replay.gameOver).toBe(false);
  });

  it("rechaza un array que no es de moves", () => {
    expect(replayChessMoves("not-an-array")).toEqual({
      valid: false,
      reason: "Malformed or too-long move log.",
    });
  });

  it("rechaza una jugada con formato UCI inválido (longitud incorrecta)", () => {
    const replay = replayChessMoves(["e2e4extra"]);
    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).toMatch(/Malformed move/);
  });
});
