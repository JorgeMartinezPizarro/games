import { useCallback, useEffect, useMemo, useState } from "react";

// Legacy key and format (dd-mm-yyyy): this keeps the date each browser had
// already saved. It only lives in localStorage and never leaves the browser.
const STORAGE_KEY = "123213231asdssdadasdas213";
const DAY_MS = 86_400_000;

// "dd-mm-yyyy" (stored) → "yyyy-mm-dd" (<input type="date">), or "" if invalid.
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

// Days (≈ rotations of the Earth on its axis) from the date until `now`.
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
      // No access to localStorage (private mode, restricted iframe): no date.
    }
  }, []);

  const setBirthDate = useCallback((iso: string) => {
    setBirthDateState(iso);
    try {
      localStorage.setItem(STORAGE_KEY, isoToStored(iso));
    } catch {
      // Same as above: it's only used for this visit.
    }
  }, []);

  const rotations = useMemo(() => rotationsSince(birthDate, Date.now()), [birthDate]);

  return { birthDate, rotations, setBirthDate };
}
