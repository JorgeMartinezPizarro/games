import React, { useRef, type ReactNode } from "react";
import ArrowDropDownRounded from "@mui/icons-material/ArrowDropDownRounded";
import ArrowLeftRounded from "@mui/icons-material/ArrowLeftRounded";
import ArrowRightRounded from "@mui/icons-material/ArrowRightRounded";
import RotateLeftRounded from "@mui/icons-material/RotateLeftRounded";
import RotateRightRounded from "@mui/icons-material/RotateRightRounded";
import styles from "./Tetris.module.css";

// Iconos grandes (el sx de MUI manda sobre el CSS del botón): triángulos
// rellenos para la cruceta, como en una consola.
const DPAD = { fontSize: 72 };
const ROTATE = { fontSize: 46 };

interface TouchControlsProps {
  startRepeat: (key: string, action: () => void) => void;
  stopRepeat: (key: string) => void;
  moveLeft: () => void;
  moveRight: () => void;
  softDrop: () => void;
  rotateLeft: () => void;
  rotateRight: () => void;
}

// Botones táctiles: mover y bajar se repiten mientras se mantienen pulsados;
// girar es una pulsación única.
export const TouchControls = React.memo(function TouchControls({
  startRepeat,
  stopRepeat,
  moveLeft,
  moveRight,
  softDrop,
  rotateLeft,
  rotateRight,
}: TouchControlsProps) {
  // Evita que el "click" fantasma que sigue a un touchstart repita la acción.
  const lastWasTouch = useRef(false);
  const touchGuard = (action: () => void) => (e: React.TouchEvent) => {
    e.preventDefault();
    lastWasTouch.current = true;
    action();
  };
  const mouseGuard = (action: () => void) => () => {
    if (lastWasTouch.current) {
      lastWasTouch.current = false;
      return;
    }
    action();
  };

  const hold = (key: string, action: () => void, label: string, icon: ReactNode) => (
    <button
      type="button"
      className={styles.pad}
      data-pad={key === "ml" ? "left" : key === "mr" ? "right" : "down"}
      aria-label={label}
      onTouchStart={touchGuard(() => startRepeat(key, action))}
      onTouchEnd={() => stopRepeat(key)}
      onMouseDown={mouseGuard(() => startRepeat(key, action))}
      onMouseUp={() => stopRepeat(key)}
      onMouseLeave={() => stopRepeat(key)}
    >
      {icon}
    </button>
  );

  const tap = (pad: "rotl" | "rotr", action: () => void, label: string, icon: ReactNode) => (
    <button
      type="button"
      className={styles.pad}
      data-kind="rotate"
      data-pad={pad}
      aria-label={label}
      onTouchStart={touchGuard(action)}
      onMouseDown={mouseGuard(action)}
    >
      {icon}
    </button>
  );

  return (
    <div className={styles.pads}>
      {hold("ml", moveLeft, "Izquierda (A)", <ArrowLeftRounded sx={DPAD} />)}
      {hold("mr", moveRight, "Derecha (D)", <ArrowRightRounded sx={DPAD} />)}
      {hold("md", softDrop, "Bajar (S)", <ArrowDropDownRounded sx={DPAD} />)}
      {tap("rotl", rotateLeft, "Girar izquierda (O)", <RotateLeftRounded sx={ROTATE} />)}
      {tap("rotr", rotateRight, "Girar derecha (P)", <RotateRightRounded sx={ROTATE} />)}
    </div>
  );
});

export function KeyHints() {
  return (
    <div className={styles.keys}>
      <div><kbd>←</kbd><kbd>A</kbd> Izquierda</div>
      <div><kbd>→</kbd><kbd>D</kbd> Derecha</div>
      <div><kbd>↓</kbd><kbd>S</kbd> Bajar</div>
      <div><kbd>O</kbd> Girar ↺</div>
      <div><kbd>P</kbd> Girar ↻</div>
    </div>
  );
}
