import { describe, expect, it, vi } from "vitest";

// LINES_TARGET a 2 solo en este fichero: permite reproducir una partida
// completa (2 líneas limpiadas con 5 piezas O) sin resolver Tetris de
// verdad, igual que en app/api/scores/route.test.ts.
vi.mock("@/app/lib/tetris/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/tetris/engine")>();
  return { ...actual, LINES_TARGET: 2 };
});

import { MAX_ACTIONS, MAX_DURATION_MS, replayTetris } from "./replay";
import {
  buildTwoRowClearActions,
  buildWallKickExhaustionActions,
  findSeedWithConsecutiveOPieces,
  findSeedWithPieceSequence,
  WALL_KICK_SEQUENCE,
} from "./testFixtures";

describe("replayTetris — cotas de cordura", () => {
  it("MAX_ACTIONS + 1 acciones se rechaza directamente por longitud", () => {
    const actions = Array.from({ length: MAX_ACTIONS + 1 }, (_, i) => ({ type: "tick", t: i }));
    expect(replayTetris(1, actions)).toEqual({
      valid: false,
      reason: "Malformed or empty action log.",
    });
  });

  it("exactamente MAX_ACTIONS acciones no se rechaza por longitud (falla más adelante, por reglas del juego)", () => {
    const actions = Array.from({ length: MAX_ACTIONS }, (_, i) => ({ type: "tick", t: i }));
    const replay = replayTetris(1, actions);

    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).not.toMatch(/Malformed or empty action log/);
  });

  it("un timestamp mayor que MAX_DURATION_MS se rechaza como log malformado", () => {
    const replay = replayTetris(1, [{ type: "resume", t: MAX_DURATION_MS + 1 }]);
    expect(replay).toEqual({ valid: false, reason: "Malformed or empty action log." });
  });

  it("un timestamp igual a MAX_DURATION_MS no se rechaza por duración", () => {
    const replay = replayTetris(1, [{ type: "resume", t: MAX_DURATION_MS }]);
    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).not.toMatch(/Malformed or empty action log/);
  });

  it("rechaza un array vacío", () => {
    expect(replayTetris(1, [])).toEqual({
      valid: false,
      reason: "Malformed or empty action log.",
    });
  });

  it("rechaza timestamps fuera de orden (decrecientes)", () => {
    const replay = replayTetris(1, [
      { type: "resume", t: 10 },
      { type: "tick", t: 5 },
    ]);
    expect(replay).toEqual({ valid: false, reason: "Malformed or empty action log." });
  });
});

describe("replayTetris — manipulación del log tras el final de la partida", () => {
  it("acciones añadidas después de completar el objetivo se ignoran (no alteran el resultado)", () => {
    const seed = findSeedWithConsecutiveOPieces(5);
    const cleanActions = buildTwoRowClearActions();

    const baseline = replayTetris(seed, cleanActions);
    expect(baseline).toEqual({ valid: true, lines: 2 });

    const lastT = cleanActions[cleanActions.length - 1].t;
    const tampered = [
      ...cleanActions,
      { type: "left", t: lastT + 1 },
      { type: "rotateRight", t: lastT + 2 },
      { type: "softDrop", t: lastT + 3 },
    ];

    expect(replayTetris(seed, tampered)).toEqual(baseline);
  });
});

describe("replayTetris — agotamiento de wall-kick", () => {
  // Una pieza I vertical pegada a la pared derecha (columna 9) no puede
  // rotar a horizontal: ninguno de los 5 desplazamientos de wall-kick
  // ([0,-1,1,-2,2]) cabe en un tablero de 10 columnas (una I horizontal
  // solo cabe hasta x=6). La rotación debe ser un no-op silencioso, sin
  // lanzar y sin mover la pieza. Se verifica de forma indirecta pero
  // inequívoca: el resto de la partida (4 O + otra I) solo completa las 2
  // filas inferiores si la columna 9 quedó bloqueada donde debía — si el
  // wall-kick se hubiera "colado" fuera de los límites, esas filas nunca se
  // habrían completado.
  it("una I vertical pegada a la pared no rota (todos los kicks colisionan) y la partida sigue con normalidad", () => {
    const seed = findSeedWithPieceSequence(WALL_KICK_SEQUENCE);
    const actions = buildWallKickExhaustionActions();

    const replay = replayTetris(seed, actions);

    expect(replay).toEqual({ valid: true, lines: 2 });
  });
});
