import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/app/lib/numbers/db", () => ({ createNumbersGame: vi.fn() }));

import { requireAuth } from "@/app/lib/auth";
import { createNumbersGame } from "@/app/lib/numbers/db";
import { POST } from "./route";

const user = { id: "user-1", name: "Test", email: "t@t.com" };

function request() {
  return new NextRequest("http://localhost/api/numbers/new-game", { method: "POST" });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/numbers/new-game", () => {
  it("responde 500 con el mensaje de error si requireAuth falla", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("No session cookie");
    expect(createNumbersGame).not.toHaveBeenCalled();
  });

  it("crea la partida para el usuario autenticado y responde 200 con el tablero", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    const board = [{ values: { n: 3, b: false, i: 0 } }];
    vi.mocked(createNumbersGame).mockReturnValue({ nonce: "n1", timestamp: 123, board });

    const res = await POST(request());
    const body = await res.json();

    expect(createNumbersGame).toHaveBeenCalledWith("user-1");
    expect(res.status).toBe(200);
    expect(body).toEqual({ nonce: "n1", timestamp: 123, board });
  });

  it("responde 500 si createNumbersGame lanza", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(createNumbersGame).mockImplementation(() => {
      throw new Error("db error");
    });

    const res = await POST(request());
    expect(res.status).toBe(500);
  });
});
