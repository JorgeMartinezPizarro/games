import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/app/lib/words/db", () => ({
  getWordsGame: vi.fn(),
  advanceWordsGame: vi.fn(),
  deleteWordsGame: vi.fn(),
  markWordsGameEnded: vi.fn(),
}));

import { requireAuth } from "@/app/lib/auth";
import {
  advanceWordsGame,
  deleteWordsGame,
  getWordsGame,
  markWordsGameEnded,
} from "@/app/lib/words/db";
import { POST } from "./route";

const user = { id: "user-1", name: "Test", email: "t@t.com" };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/words/answer", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeGame(overrides: Partial<NonNullable<Awaited<ReturnType<typeof getWordsGame>>>> = {}) {
  return {
    userId: "user-1",
    rounds: [
      { target: "hola", audio: "/a.mp3", choices: ["hola", "adios"] },
      { target: "gato", audio: "/b.mp3", choices: ["gato", "perro"] },
    ],
    answeredCount: 0,
    ended: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/words/answer", () => {
  it("responds 400 if the nonce is missing", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ roundIndex: 0, answer: "hola" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responds 400 if roundIndex is not an integer >= 0", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ nonce: "n1", roundIndex: -1, answer: "hola" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/roundIndex/i);
  });

  it("responds 400 if answer is missing", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ nonce: "n1", roundIndex: 0, answer: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/answer/i);
  });

  it("responds 400 if the nonce does not exist or belongs to another user", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getWordsGame).mockResolvedValue(null);

    const res = await POST(request({ nonce: "n1", roundIndex: 0, answer: "hola" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid or expired nonce/);
  });

  it("responds 400 and deletes the game if a round is skipped", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getWordsGame).mockResolvedValue(makeGame({ answeredCount: 0 }));

    const res = await POST(request({ nonce: "n1", roundIndex: 1, answer: "gato" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unexpected round/);
    expect(deleteWordsGame).toHaveBeenCalledWith("n1");
  });

  it("wrong answer: marks the game as ended (does not delete it) and reveals the target", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getWordsGame).mockResolvedValue(makeGame({ answeredCount: 0 }));

    const res = await POST(request({ nonce: "n1", roundIndex: 0, answer: "adios" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ correct: false, target: "hola" });
    expect(markWordsGameEnded).toHaveBeenCalledWith("n1");
    expect(deleteWordsGame).not.toHaveBeenCalled();
    expect(advanceWordsGame).not.toHaveBeenCalled();
  });

  it("responds 400 if the game is already marked as ended", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getWordsGame).mockResolvedValue(makeGame({ answeredCount: 0, ended: true }));

    const res = await POST(request({ nonce: "n1", roundIndex: 0, answer: "hola" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game already ended/);
    expect(advanceWordsGame).not.toHaveBeenCalled();
  });

  it("correct answer but not the last round: finished false", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getWordsGame).mockResolvedValue(makeGame({ answeredCount: 0 }));
    vi.mocked(advanceWordsGame).mockResolvedValue(1);

    const res = await POST(request({ nonce: "n1", roundIndex: 0, answer: "hola" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ correct: true, finished: false });
    expect(deleteWordsGame).not.toHaveBeenCalled();
  });

  it("correct answer on the last round: finished true", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getWordsGame).mockResolvedValue(makeGame({ answeredCount: 1 }));
    vi.mocked(advanceWordsGame).mockResolvedValue(2);

    const res = await POST(request({ nonce: "n1", roundIndex: 1, answer: "gato" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ correct: true, finished: true });
  });

  it("responds 500 if requireAuth throws", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request({ nonce: "n1", roundIndex: 0, answer: "hola" }));
    expect(res.status).toBe(500);
  });
});
