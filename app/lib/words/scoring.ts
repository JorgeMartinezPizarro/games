// Misma forma que numbers (computeNumbersScore en app/lib/numbers/board.ts):
// cubo de los aciertos entre el tiempo empleado, para que cualquier partida
// puntúe (aunque sea con pocos aciertos), premiando más la rapidez cuantos
// más aciertos hay. La constante del numerador es mayor que en numbers:
// cada ronda de Wording tarda bastante más que un paso de Numbers, así que
// necesita más peso para dar scores en un rango comparable.
export function computeWordsScore(correctAnswers: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round((correctAnswers ** 3 * 11000) / elapsedMs);
}
