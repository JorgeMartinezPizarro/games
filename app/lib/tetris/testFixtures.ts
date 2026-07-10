import { COLS, Piece, ROWS, TETROMINOS } from "@/app/lib/tetris/engine";
import { createPieceGenerator } from "@/app/lib/tetris/rng";

const O_PIECE = TETROMINOS[1]; // pieza 2x2: la más simple de posicionar a mano
const I_PIECE = TETROMINOS[4]; // pieza recta: la única que cambia de ancho al rotar

// Busca un seed cuyas primeras `count` piezas generadas sean todas la pieza
// O. Con eso podemos rellenar (y limpiar) una fila completa colocando cada
// pieza en un par de columnas distinto, sin tener que resolver Tetris de
// verdad para un seed arbitrario.
export function findSeedWithConsecutiveOPieces(count: number, maxSeed = 500_000): number {
  for (let seed = 0; seed < maxSeed; seed++) {
    const gen = createPieceGenerator(seed);
    let ok = true;
    for (let i = 0; i < count; i++) {
      if (gen() !== O_PIECE) {
        ok = false;
        break;
      }
    }
    if (ok) return seed;
  }
  throw new Error(`No se encontró un seed con ${count} piezas O consecutivas (max ${maxSeed}).`);
}

// Las 5 columnas destino (pieza O = 2 columnas de ancho, tablero de 10) que
// entre las 5 rellenan las dos filas inferiores del tablero por completo.
export const O_PIECE_TARGET_COLUMNS = [0, 2, 4, 6, 8];

export type LoggedAction = { type: string; t: number };

// Construye el log de acciones (formato que consume replayTetris) que, con
// un seed de findSeedWithConsecutiveOPieces(5), rellena y limpia las dos
// filas inferiores de un tablero vacío con 5 piezas O consecutivas.
export function buildTwoRowClearActions(): LoggedAction[] {
  const spawnX = Math.floor(COLS / 2) - 1;
  const dropDistance = ROWS - 2; // altura de una pieza O = 2 filas, tablero vacío

  const actions: LoggedAction[] = [];
  let t = 0;
  const push = (type: string) => actions.push({ type, t: t++ });

  push("resume");
  for (const col of O_PIECE_TARGET_COLUMNS) {
    const dx = col - spawnX;
    const horizontal = dx < 0 ? "left" : "right";
    for (let i = 0; i < Math.abs(dx); i++) push(horizontal);
    for (let i = 0; i <= dropDistance; i++) push("softDrop");
  }
  return actions;
}

// Generaliza findSeedWithConsecutiveOPieces a una secuencia arbitraria de
// tipos de pieza (no solo O repetida): busca un seed cuyas primeras
// `sequence.length` piezas generadas coincidan, en orden, con `sequence`.
export function findSeedWithPieceSequence(sequence: Piece[], maxSeed = 2_000_000): number {
  for (let seed = 0; seed < maxSeed; seed++) {
    const gen = createPieceGenerator(seed);
    let ok = true;
    for (const target of sequence) {
      if (gen() !== target) {
        ok = false;
        break;
      }
    }
    if (ok) return seed;
  }
  throw new Error(
    `No se encontró un seed con esa secuencia de ${sequence.length} piezas (max ${maxSeed}).`
  );
}

// Secuencia de piezas que necesita buildWallKickExhaustionActions(): una I,
// cuatro O y otra I. Úsese con findSeedWithPieceSequence(WALL_KICK_SEQUENCE).
export const WALL_KICK_SEQUENCE: Piece[] = [I_PIECE, O_PIECE, O_PIECE, O_PIECE, O_PIECE, I_PIECE];

// Reproduce el agotamiento de wall-kick de app/lib/tetris/replay.ts: la
// primera pieza I se rota a vertical, se desplaza hasta pegarse a la pared
// derecha (columna 9) y se intenta rotar de nuevo a horizontal justo ahí.
// Con el tablero vacío, una I horizontal (4 de ancho) solo cabe hasta
// x=6 — ninguno de los 5 desplazamientos de wall-kick ([0,-1,1,-2,2])
// permite volver a caber en x=9, así que la rotación debe quedarse en un
// no-op y la pieza debe seguir vertical en la columna 9.
//
// Las siguientes piezas (4 O + 1 I) solo rellenan el resto de la fila
// inferior (columnas 0-7 y 8) para que limpiar exactamente esas 2 filas
// dependa de que la columna 9 se haya bloqueado donde debía: si el
// wall-kick se hubiera "colado" fuera de los límites del tablero en vez de
// quedarse quieto, esas 2 filas nunca llegarían a completarse.
export function buildWallKickExhaustionActions(): LoggedAction[] {
  const spawnX = Math.floor(COLS / 2) - 1;
  const iDropDistance = ROWS - 4; // altura de la pieza I en vertical = 4 filas
  const oDropDistance = ROWS - 2;

  const actions: LoggedAction[] = [];
  let t = 0;
  const push = (type: string) => actions.push({ type, t: t++ });

  push("resume");

  // Pieza 1 (I): a vertical, pegada a la pared derecha (columna 9), y un
  // intento de rotación que debe agotar los 5 wall-kicks sin efecto.
  push("rotateRight");
  const toRightWall = COLS - 1 - spawnX; // columna 4 -> 9
  for (let i = 0; i < toRightWall; i++) push("right");
  push("rotateRight"); // debe ser un no-op: sigue vertical en la columna 9
  for (let i = 0; i <= iDropDistance; i++) push("softDrop");

  // 4 piezas O: rellenan las columnas 0-1, 2-3, 4-5 y 6-7.
  for (const col of O_PIECE_TARGET_COLUMNS.slice(0, 4)) {
    const dx = col - spawnX;
    const horizontal = dx < 0 ? "left" : "right";
    for (let i = 0; i < Math.abs(dx); i++) push(horizontal);
    for (let i = 0; i <= oDropDistance; i++) push("softDrop");
  }

  // Pieza 6 (I): vertical, columna 8 — la única que faltaba para completar
  // ambas filas inferiores.
  push("rotateRight");
  const toCol8 = 8 - spawnX;
  for (let i = 0; i < toCol8; i++) push("right");
  for (let i = 0; i <= iDropDistance; i++) push("softDrop");

  return actions;
}
