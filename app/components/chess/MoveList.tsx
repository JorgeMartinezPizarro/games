import { useEffect, useRef } from "react";
import styles from "./Chess.module.css";

// Notación española: R rey, D dama, T torre, A alfil, C caballo. En SAN las
// mayúsculas solo son piezas (columnas en minúscula, enroque con "O").
const PIECE_ES: Record<string, string> = { K: "R", Q: "D", R: "T", B: "A", N: "C" };

export function toSpanishSan(san: string): string {
  return san.replace(/[KQRBN]/g, (piece) => PIECE_ES[piece]);
}

export function MoveList({ history }: { history: string[] }) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Siempre a la vista la última jugada.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [history.length]);

  const rows: [string, string | undefined][] = [];
  for (let i = 0; i < history.length; i += 2) rows.push([history[i], history[i + 1]]);
  const last = history.length - 1;

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Jugadas</h2>
      <div className={styles.moves} ref={listRef}>
        {rows.length === 0 ? (
          <p className={styles.empty}>Mueve una pieza para empezar. Juegas con blancas.</p>
        ) : (
          rows.map(([white, black], row) => (
            <div key={row} className={styles.moveRow}>
              <span className={styles.moveNumber}>{row + 1}.</span>
              <span className={row * 2 === last ? styles.current : undefined}>{toSpanishSan(white)}</span>
              <span className={row * 2 + 1 === last ? styles.current : undefined}>
                {black ? toSpanishSan(black) : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
