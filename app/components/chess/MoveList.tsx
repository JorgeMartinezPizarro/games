import { useEffect, useRef } from "react";
import styles from "./Chess.module.css";

export function MoveList({ history }: { history: string[] }) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest move in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [history.length]);

  const rows: [string, string | undefined][] = [];
  for (let i = 0; i < history.length; i += 2) rows.push([history[i], history[i + 1]]);
  const last = history.length - 1;

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Moves</h2>
      <div className={styles.moves} ref={listRef}>
        {rows.length === 0 ? (
          <p className={styles.empty}>Move a piece to start. You play white.</p>
        ) : (
          rows.map(([white, black], row) => (
            <div key={row} className={styles.moveRow}>
              <span className={styles.moveNumber}>{row + 1}.</span>
              <span className={row * 2 === last ? styles.current : undefined}>{white}</span>
              <span className={row * 2 + 1 === last ? styles.current : undefined}>{black ?? ""}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
