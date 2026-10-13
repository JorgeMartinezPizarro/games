import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined";
import styles from "./Chess.module.css";

export function PlayerCard({
  name,
  meta,
  you = false,
  active,
  thinking = false,
}: {
  name: string;
  meta: string;
  you?: boolean;
  active: boolean;
  thinking?: boolean;
}) {
  return (
    <div className={styles.player} data-active={active} data-slot={you ? "you" : "opponent"}>
      <span className={styles.avatar} data-you={you}>
        {you ? name.slice(0, 1).toUpperCase() : <SmartToyOutlined fontSize="small" />}
      </span>
      <span>
        <b className={styles.playerName}>{name}</b>
        <span className={styles.playerMeta}>{meta}</span>
      </span>
      {thinking && (
        <span className={styles.thinking} aria-label="Pensando">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}
