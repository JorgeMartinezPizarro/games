import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/app/lib/chess/db", () => ({ createChessGame: vi.fn() }));

import { requireAuth } from "@/app/lib/auth";
import { createChessGame } from "@/app/lib/chess/db";
import { POST } from "./route";

const user = { id: "user-1", name: "Test", email: "t@t.com" };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/chess/new-game", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/chess/new-game", () => {
  it("responde 400 si elo no es un entero", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ elo: "muchísimo" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/elo must be an integer/);
    expect(createChessGame).not.toHaveBeenCalled();
  });

  it.each([399, 3001])("responde 400 si elo está fuera de rango (%d)", async (elo) => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ elo }));
    expect(res.status).toBe(400);
  });

  it("crea la partida con el elo y userId dados y responde 200", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(createChessGame).mockResolvedValue({ nonce: "n1", timestamp: 42 });

    const res = await POST(request({ elo: 1500 }));
    const body = await res.json();

    expect(createChessGame).toHaveBeenCalledWith("user-1", 1500);
    expect(res.status).toBe(200);
    expect(body).toEqual({ nonce: "n1", timestamp: 42 });
  });

  it("responde 500 si requireAuth lanza", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request({ elo: 1500 }));
    expect(res.status).toBe(500);
    expect(createChessGame).not.toHaveBeenCalled();
  });

  it("responde 500 si createChessGame lanza", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(createChessGame).mockImplementation(() => {
      throw new Error("db error");
    });

    const res = await POST(request({ elo: 1500 }));
    expect(res.status).toBe(500);
  });
});
