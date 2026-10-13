import { useCallback, useEffect, useMemo, useState } from "react";

// Clave y formato (dd-mm-yyyy) históricos: así se conserva la fecha que cada
// navegador ya tenía guardada. Solo vive en localStorage, nunca sale del navegador.
const STORAGE_KEY = "123213231asdssdadasdas213";
const DAY_MS = 86_400_000;

// "dd-mm-yyyy" (guardado) → "yyyy-mm-dd" (<input type="date">), o "" si no es válida.
export function storedToIso(stored: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(stored.trim());
  if (!match) return "";
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return Number.isNaN(new Date(`${iso}T00:00:00`).getTime()) ? "" : iso;
}

export function isoToStored(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

// Días (≈ vueltas de la Tierra sobre sí misma) desde la fecha hasta `now`.
export function rotationsSince(iso: string, now: number): number | null {
  if (!iso) return null;
  const birth = new Date(`${iso}T00:00:00`).getTime();
  if (Number.isNaN(birth) || birth > now) return null;
  return Math.round((now - birth) / DAY_MS);
}

export function useEarthRotations() {
  const [birthDate, setBirthDateState] = useState("");

  useEffect(() => {
    try {
      setBirthDateState(storedToIso(localStorage.getItem(STORAGE_KEY) ?? ""));
    } catch {
      // Sin acceso a localStorage (modo privado, iframe restringido): sin fecha.
    }
  }, []);

  const setBirthDate = useCallback((iso: string) => {
    setBirthDateState(iso);
    try {
      localStorage.setItem(STORAGE_KEY, isoToStored(iso));
    } catch {
      // Igual que arriba: se usa solo en esta visita.
    }
  }, []);

  const rotations = useMemo(() => rotationsSince(birthDate, Date.now()), [birthDate]);

  return { birthDate, rotations, setBirthDate };
}
