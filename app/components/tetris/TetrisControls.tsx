import React, { useRef, type ReactNode } from "react";
import RotateLeftRounded from "@mui/icons-material/RotateLeftRounded";
import RotateRightRounded from "@mui/icons-material/RotateRightRounded";
import styles from "./Tetris.module.css";

// D-pad: a filled triangle that fills the button, like on a console (MUI
// icons leave the glyph at a third of their box).
const ARROWS = { left: "M16 5 8 12l8 7z", right: "M8 5l8 7-8 7z", down: "M5 8h14l-7 8z" };

function DpadArrow({ direction }: { direction: keyof typeof ARROWS }) {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden>
      <path d={ARROWS[direction]} fill="currentColor" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}

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

// Touch buttons: move and drop repeat while held down; rotate is a single
// press.
export const TouchControls = React.memo(function TouchControls({
  startRepeat,
  stopRepeat,
  moveLeft,
  moveRight,
  softDrop,
  rotateLeft,
  rotateRight,
}: TouchControlsProps) {
  // Prevents the ghost "click" that follows a touchstart from repeating the action.
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
      {hold("ml", moveLeft, "Left (A)", <DpadArrow direction="left" />)}
      {hold("mr", moveRight, "Right (D)", <DpadArrow direction="right" />)}
      {hold("md", softDrop, "Down (S)", <DpadArrow direction="down" />)}
      {tap("rotl", rotateLeft, "Rotate left (O)", <RotateLeftRounded sx={ROTATE} />)}
      {tap("rotr", rotateRight, "Rotate right (P)", <RotateRightRounded sx={ROTATE} />)}
    </div>
  );
});

export function KeyHints() {
  return (
    <div className={styles.keys}>
      <div><kbd>←</kbd><kbd>A</kbd> Left</div>
      <div><kbd>→</kbd><kbd>D</kbd> Right</div>
      <div><kbd>↓</kbd><kbd>S</kbd> Down</div>
      <div><kbd>O</kbd> Rotate ↺</div>
      <div><kbd>P</kbd> Rotate ↻</div>
    </div>
  );
}
