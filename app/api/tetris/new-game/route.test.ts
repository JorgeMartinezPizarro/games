import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/app/lib/tetris/db", () => ({ createTetrisGame: vi.fn() }));

import { requireAuth } from "@/app/lib/auth";
import { createTetrisGame } from "@/app/lib/tetris/db";
import { LINES_TARGET } from "@/app/lib/tetris/engine";
import { POST } from "./route";

const user = { id: "user-1", name: "Test", email: "t@t.com" };

function request() {
  return new NextRequest("http://localhost/api/tetris/new-game", { method: "POST" });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/tetris/new-game", () => {
  it("responds 500 with the error message if requireAuth fails", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("No session cookie");
    expect(createTetrisGame).not.toHaveBeenCalled();
  });

  it("creates the game for the authenticated user and responds 200 with linesTarget", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(createTetrisGame).mockResolvedValue({ nonce: "n1", timestamp: 123, seed: 999 });

    const res = await POST(request());
    const body = await res.json();

    expect(createTetrisGame).toHaveBeenCalledWith("user-1");
    expect(res.status).toBe(200);
    expect(body).toEqual({ nonce: "n1", timestamp: 123, seed: 999, linesTarget: LINES_TARGET });
  });

  it("responds 500 if createTetrisGame throws", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(createTetrisGame).mockImplementation(() => {
      throw new Error("db error");
    });

    const res = await POST(request());
    expect(res.status).toBe(500);
  });
});
