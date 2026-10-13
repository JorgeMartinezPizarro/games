import type { ReactNode } from "react";
import GameIcon from "./GameIcon";
import type { GameKey } from "./gameCatalog";
import styles from "./ui.module.css";

// Piezas pequeñas compartidas por los juegos. Solo presentación.

export function StatTile({
  label,
  value,
  testId,
  children,
}: {
  label: string;
  value: ReactNode;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <b className={`num ${styles.statValue}`} data-testid={testId}>
        {value}
      </b>
      {children}
    </div>
  );
}

// Posición en el ranking completo de la partida recién guardada.
export function RankBadge({ rank, total }: { rank: number | null; total: number | null }) {
  if (rank == null || total == null) return null;
  const top10 = rank <= 10;
  return (
    <p className={styles.rank} data-testid="rank" data-top10={top10}>
      Tu posición: #{rank} de {total}
      {top10 && " · Top 10"}
    </p>
  );
}

// Pantalla de presentación antes de la primera partida.
export function GameIntro({
  game,
  title,
  children,
  actions,
}: {
  game: GameKey;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section className={styles.intro}>
      <span className={styles.introIcon}>
        <GameIcon game={game} size={42} />
      </span>
      <h2 className={styles.introTitle}>{title}</h2>
      <p className={styles.introText}>{children}</p>
      <div className={styles.introActions}>{actions}</div>
    </section>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className={styles.notice} role="alert">
      {children}
    </p>
  );
}

export const uiStyles = styles;
