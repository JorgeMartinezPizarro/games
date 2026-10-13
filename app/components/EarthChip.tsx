import { useState } from "react";
import PublicOutlined from "@mui/icons-material/PublicOutlined";
import styles from "./Home.module.css";

// Chip del menú con las vueltas a la Tierra desde la fecha de nacimiento.
// Al pulsarlo se edita la fecha en el sitio.
export default function EarthChip({
  birthDate,
  rotations,
  onChange,
}: {
  birthDate: string;
  rotations: number | null;
  onChange: (iso: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <span className={`${styles.chip} ${styles.chipEditing}`}>
        <PublicOutlined sx={{ fontSize: 16 }} />
        <input
          type="date"
          aria-label="Tu fecha de nacimiento"
          className={styles.dateInput}
          defaultValue={birthDate}
          max={new Date().toISOString().slice(0, 10)}
          autoFocus
          onBlur={() => setEditing(false)}
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") setEditing(false);
          }}
        />
      </span>
    );
  }

  return (
    <button type="button" className={styles.chip} onClick={() => setEditing(true)}>
      <PublicOutlined sx={{ fontSize: 16 }} />
      {rotations === null ? (
        "¿Cuántas vueltas a la Tierra llevas?"
      ) : (
        <span>
          <b className="num">{rotations.toLocaleString("es-ES")}</b> vueltas a la Tierra
        </span>
      )}
    </button>
  );
}
