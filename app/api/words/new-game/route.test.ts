import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/app/lib/words/db", () => ({ createWordsGame: vi.fn() }));

import { requireAuth } from "@/app/lib/auth";
import { createWordsGame } from "@/app/lib/words/db";
import { POST } from "./route";

const user = { id: "user-1", name: "Test", email: "t@t.com" };

function request(url: string) {
  return new NextRequest(url, { method: "POST" });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/words/new-game", () => {
  it("responde 500 con el mensaje de error si requireAuth falla", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request("http://localhost/api/words/new-game"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("No session cookie");
    expect(createWordsGame).not.toHaveBeenCalled();
  });

  it("usa rounds/choices por defecto si no vienen en la query", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(createWordsGame).mockResolvedValue({ nonce: "n1", timestamp: 1, rounds: [] });

    await POST(request("http://localhost/api/words/new-game"));

    expect(createWordsGame).toHaveBeenCalledWith("user-1", 10, 4);
  });

  it("usa rounds/choices de la query cuando son enteros válidos", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(createWordsGame).mockResolvedValue({ nonce: "n1", timestamp: 1, rounds: [] });

    await POST(request("http://localhost/api/words/new-game?rounds=5&choices=3"));

    expect(createWordsGame).toHaveBeenCalledWith("user-1", 5, 3);
  });

  it("ignora valores no válidos (negativos, no numéricos) y usa el default", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(createWordsGame).mockResolvedValue({ nonce: "n1", timestamp: 1, rounds: [] });

    await POST(request("http://localhost/api/words/new-game?rounds=-3&choices=abc"));

    expect(createWordsGame).toHaveBeenCalledWith("user-1", 10, 4);
  });

  it("responde 200 con la partida creada por createWordsGame", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    const game = {
      nonce: "n1",
      timestamp: 123,
      rounds: [{ audio: "/a.mp3", choices: ["a", "b", "c", "d"] }],
    };
    vi.mocked(createWordsGame).mockResolvedValue(game);

    const res = await POST(request("http://localhost/api/words/new-game"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(game);
  });

  it("responde 500 si createWordsGame lanza", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(createWordsGame).mockRejectedValue(new Error("app.py unreachable"));

    const res = await POST(request("http://localhost/api/words/new-game"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("app.py unreachable");
  });
});
