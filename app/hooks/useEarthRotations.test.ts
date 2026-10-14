// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isoToStored, rotationsSince, storedToIso, useEarthRotations } from "./useEarthRotations";

const KEY = "123213231asdssdadasdas213";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("date conversion", () => {
  it("reads the legacy dd-mm-yyyy format and writes it back the same way", () => {
    expect(storedToIso("24-06-1985")).toBe("1985-06-24");
    expect(isoToStored("1985-06-24")).toBe("24-06-1985");
  });

  it("ignores values that aren't dates", () => {
    expect(storedToIso("")).toBe("");
    expect(storedToIso("1985-06-24")).toBe("");
    expect(storedToIso("hola")).toBe("");
  });
});

describe("rotationsSince", () => {
  const now = new Date("2026-10-13T00:00:00").getTime();

  it("counts the elapsed days", () => {
    expect(rotationsSince("2026-10-03", now)).toBe(10);
  });

  it("no date or a future date yields no number", () => {
    expect(rotationsSince("", now)).toBeNull();
    expect(rotationsSince("2030-01-01", now)).toBeNull();
  });
});

describe("useEarthRotations", () => {
  it("restores the date saved by the previous version of the menu", () => {
    localStorage.setItem(KEY, "01-01-2000");

    const { result } = renderHook(() => useEarthRotations());

    expect(result.current.birthDate).toBe("2000-01-01");
    expect(result.current.rotations).toBeGreaterThan(9000);
  });

  it("saves the new date in the legacy format", () => {
    const { result } = renderHook(() => useEarthRotations());

    act(() => result.current.setBirthDate("1990-05-17"));

    expect(localStorage.getItem(KEY)).toBe("17-05-1990");
    expect(result.current.birthDate).toBe("1990-05-17");
  });
});
