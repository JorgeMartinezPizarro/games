import type { ReactNode } from "react";
import GameIcon from "./GameIcon";
import type { GameKey } from "./gameCatalog";
import styles from "./ui.module.css";

// Small pieces shared by the games. Presentation only.

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

// Position of the just-saved game in the full leaderboard.
export function RankBadge({ rank, total }: { rank: number | null; total: number | null }) {
  if (rank == null || total == null) return null;
  const top10 = rank <= 10;
  return (
    <p className={styles.rank} data-testid="rank" data-top10={top10}>
      Your rank: #{rank} of {total}
      {top10 && " · Top 10"}
    </p>
  );
}

// Intro screen before the first game.
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
