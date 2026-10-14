import { useEffect, useRef, useState } from "react";

// true for `ms` every time `value` goes up (e.g. when clearing lines).
export function useFlashOnIncrease(value: number, ms = 320): boolean {
  const previous = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const increased = value > previous.current;
    previous.current = value;
    if (!increased) return;

    setFlash(true);
    const timer = setTimeout(() => setFlash(false), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return flash;
}
