// Partida real (jugable de verdad con chess.js, sin Stockfish ni docker):
// los caballos van y vuelven a su casilla de salida tres veces, repitiendo
// la posición inicial una tercera vez → tablas por triple repetición.
// replayChessMoves solo necesita un log de jugadas UCI legales, le da igual
// quién las jugó — así se puede probar la rama "tablas no puntúan" de
// saveChessScore sin depender del servicio de Stockfish.
export const THREEFOLD_REPETITION_DRAW = [
  "g1f3", "g8f6",
  "f3g1", "f6g8",
  "g1f3", "g8f6",
  "f3g1", "f6g8",
];
