import { useState } from "react";
import PublicOutlined from "@mui/icons-material/PublicOutlined";
import styles from "./Home.module.css";

// Menu chip showing the Earth rotations since the date of birth.
// Clicking it edits the date in place.
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
          aria-label="Your date of birth"
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
        "How many Earth rotations have you ridden?"
      ) : (
        <span>
          <b className="num">{rotations.toLocaleString("en-US")}</b> Earth rotations
        </span>
      )}
    </button>
  );
}
