import type { ReactNode } from "react";
import styles from "./Leaderboard.module.css";

export type LeaderboardColumn<T> = {
  label: string;
  value: (row: T) => ReactNode;
  align?: "left" | "right";
  strong?: boolean;
};

// Ranking común a todos los juegos. Las filas llegan ya ordenadas; aquí solo
// se recortan al top y se pintan medallas, "tú" y la partida recién guardada.
export default function Leaderboard<T>({
  title,
  subtitle,
  rows,
  columns,
  userOf,
  currentUserId,
  isRecord,
  limit = 10,
  testId,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: T[];
  columns: LeaderboardColumn<T>[];
  userOf: (row: T) => string;
  currentUserId?: string;
  isRecord?: (row: T) => boolean;
  limit?: number;
  testId?: string;
}) {
  const top = rows.slice(0, limit);

  return (
    <section className={styles.board} data-testid={testId}>
      <header className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </header>

      {top.length === 0 ? (
        <p className={styles.empty}>Todavía no hay puntuaciones. Estrena el ranking.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              {columns.map((column) => (
                <th key={column.label} className={column.align === "right" ? styles.right : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.map((row, index) => {
              const user = userOf(row);
              const mine = currentUserId !== undefined && user === currentUserId;
              const record = isRecord?.(row) ?? false;
              const rowClass = record ? styles.record : mine ? styles.mine : undefined;
              return (
                <tr key={index} className={rowClass} data-record={record || undefined}>
                  <td>
                    <span className={styles.medal} data-place={index + 1}>
                      {index + 1}
                    </span>
                  </td>
                  <td>
                    {user}
                    {mine && <span className={styles.me}>Tú</span>}
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.label}
                      className={[
                        "num",
                        column.align === "right" ? styles.right : "",
                        column.strong ? styles.strong : "",
                      ].join(" ")}
                    >
                      {column.value(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
