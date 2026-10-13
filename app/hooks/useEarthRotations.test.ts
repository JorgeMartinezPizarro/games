// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isoToStored, rotationsSince, storedToIso, useEarthRotations } from "./useEarthRotations";

const KEY = "123213231asdssdadasdas213";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("conversión de fechas", () => {
  it("lee el formato histórico dd-mm-yyyy y lo vuelve a escribir igual", () => {
    expect(storedToIso("24-06-1985")).toBe("1985-06-24");
    expect(isoToStored("1985-06-24")).toBe("24-06-1985");
  });

  it("ignora valores que no son fechas", () => {
    expect(storedToIso("")).toBe("");
    expect(storedToIso("1985-06-24")).toBe("");
    expect(storedToIso("hola")).toBe("");
  });
});

describe("rotationsSince", () => {
  const now = new Date("2026-10-13T00:00:00").getTime();

  it("cuenta los días transcurridos", () => {
    expect(rotationsSince("2026-10-03", now)).toBe(10);
  });

  it("sin fecha o con fecha futura no hay número", () => {
    expect(rotationsSince("", now)).toBeNull();
    expect(rotationsSince("2030-01-01", now)).toBeNull();
  });
});

describe("useEarthRotations", () => {
  it("recupera la fecha guardada por la versión anterior del menú", () => {
    localStorage.setItem(KEY, "01-01-2000");

    const { result } = renderHook(() => useEarthRotations());

    expect(result.current.birthDate).toBe("2000-01-01");
    expect(result.current.rotations).toBeGreaterThan(9000);
  });

  it("guarda la nueva fecha en el formato histórico", () => {
    const { result } = renderHook(() => useEarthRotations());

    act(() => result.current.setBirthDate("1990-05-17"));

    expect(localStorage.getItem(KEY)).toBe("17-05-1990");
    expect(result.current.birthDate).toBe("1990-05-17");
  });
});
