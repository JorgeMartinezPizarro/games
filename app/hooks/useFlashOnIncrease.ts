import { useEffect, useRef, useState } from "react";

// true durante `ms` cada vez que `value` sube (p. ej. al limpiar líneas).
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
