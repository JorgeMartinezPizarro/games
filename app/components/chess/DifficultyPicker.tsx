import { Slider } from "@mui/material";
import styles from "./Chess.module.css";

export const ELO_PRESETS = [
  { elo: 400, label: "Novato" },
  { elo: 1200, label: "Club" },
  { elo: 2000, label: "Experto" },
  { elo: 2800, label: "Maestro" },
];

// Dificultad de Stockfish: presets rápidos más ajuste fino. Se bloquea en
// cuanto empieza la partida (el servidor fija el ELO con la primera jugada).
export function DifficultyPicker({
  elo,
  locked,
  onChange,
}: {
  elo: number;
  locked: boolean;
  onChange: (elo: number) => void;
}) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Dificultad{locked && " · bloqueada en partida"}</h2>
      <div className={styles.presets}>
        {ELO_PRESETS.map((preset) => (
          <button
            key={preset.elo}
            type="button"
            className={styles.preset}
            aria-pressed={elo === preset.elo}
            disabled={locked}
            onClick={() => onChange(preset.elo)}
          >
            <b className="num">{preset.elo}</b>
            {preset.label}
          </button>
        ))}
      </div>
      <div className={styles.fine}>
        <Slider
          size="small"
          value={elo}
          min={400}
          max={3000}
          step={10}
          disabled={locked}
          aria-label="ELO de Stockfish"
          onChange={(_event, value) => onChange(value as number)}
        />
        <span className={`num ${styles.eloValue}`}>{elo}</span>
      </div>
    </section>
  );
}
