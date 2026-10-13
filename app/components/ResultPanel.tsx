import type { ReactNode } from "react";
import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import styles from "./ResultPanel.module.css";

export type ResultTone = "win" | "lose" | "neutral";

const TONE_ICON: Record<ResultTone, ReactNode> = {
  win: <CheckRounded />,
  lose: <CloseRounded />,
  neutral: <FlagOutlined />,
};

// Tarjeta de fin de partida común a los juegos.
export default function ResultPanel({
  tone,
  title,
  subtitle,
  stats = [],
  footer,
  actions,
}: {
  tone: ResultTone;
  title: string;
  subtitle?: ReactNode;
  stats?: { label: string; value: ReactNode }[];
  footer?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section className={styles.panel} data-tone={tone} aria-live="polite">
      <span className={styles.badge}>{TONE_ICON[tone]}</span>
      <h2 className={styles.title} data-testid="result-title">
        {title}
      </h2>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      {stats.length > 0 && (
        <div className={styles.stats}>
          {stats.map((stat) => (
            <div key={stat.label} className={styles.stat}>
              <span className={styles.statLabel}>{stat.label}</span>
              <b className={`num ${styles.statValue}`}>{stat.value}</b>
            </div>
          ))}
        </div>
      )}
      {footer}
      <div className={styles.actions}>{actions}</div>
    </section>
  );
}
