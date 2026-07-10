import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accessMock = vi.fn();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock("node:fs", () => ({
  promises: {
    access: (...args: unknown[]) => accessMock(...args),
    mkdir: (...args: unknown[]) => mkdirMock(...args),
    writeFile: (...args: unknown[]) => writeFileMock(...args),
  },
}));

import { fetchChallenge, stripTargets } from "./challenge";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_WORD_URL = "http://wordlist:5000";
  accessMock.mockReset();
  mkdirMock.mockReset().mockResolvedValue(undefined);
  writeFileMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("fetchChallenge", () => {
  it("lanza si app.py /challenge responde con un status no-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 502)));

    await expect(fetchChallenge(10, 4)).rejects.toThrow("app.py /challenge responded 502");
  });

  it("cachea el audio en disco si no existía (fetch + writeFile) y devuelve la URL local", async () => {
    accessMock.mockRejectedValue(new Error("ENOENT")); // no existe en caché
    const challengeData = {
      rounds: [{ target: "hola", audio: "/audio/hola.mp3", choices: ["hola", "adios"] }],
    };
    const audioBuffer = new ArrayBuffer(4);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(challengeData))
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => audioBuffer } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const rounds = await fetchChallenge(1, 2);

    expect(rounds).toEqual([
      { target: "hola", choices: ["hola", "adios"], audio: "/bookmarks/api/audio?file=hola.mp3" },
    ]);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(mkdirMock).toHaveBeenCalledTimes(1);
  });

  it("no vuelve a descargar el audio si ya está cacheado en disco", async () => {
    accessMock.mockResolvedValue(undefined); // ya existe
    const challengeData = {
      rounds: [{ target: "gato", audio: "/audio/gato.mp3", choices: ["gato", "perro"] }],
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(challengeData));
    vi.stubGlobal("fetch", fetchMock);

    const rounds = await fetchChallenge(1, 2);

    expect(rounds[0].audio).toBe("/bookmarks/api/audio?file=gato.mp3");
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo la llamada a /challenge, no al mp3
  });

  it("lanza si la descarga del audio responde con un status no-ok", async () => {
    accessMock.mockRejectedValue(new Error("ENOENT"));
    const challengeData = {
      rounds: [{ target: "hola", audio: "/audio/hola.mp3", choices: ["hola", "adios"] }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(challengeData))
      .mockResolvedValueOnce({ ok: false } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchChallenge(1, 2)).rejects.toThrow("Failed to fetch audio: /audio/hola.mp3");
  });
});

describe("stripTargets", () => {
  it("quita el campo target, dejando solo audio y choices", () => {
    const rounds = [
      { target: "hola", audio: "/a.mp3", choices: ["hola", "adios"] },
      { target: "gato", audio: "/b.mp3", choices: ["gato", "perro"] },
    ];
    expect(stripTargets(rounds)).toEqual([
      { audio: "/a.mp3", choices: ["hola", "adios"] },
      { audio: "/b.mp3", choices: ["gato", "perro"] },
    ]);
  });
});
