import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  postToGamingApp,
  signGamingRequest,
} from "./gamingApp";

const NOW = 1_700_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("NEXTCLOUD_URL", "https://cloud.example");
  vi.stubEnv("NEXTCLOUD_GAMING_SECRET", "s3cret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("signGamingRequest", () => {
  // Fixed vector: the Nextcloud app (PHP, hash_hmac) must produce the same
  // value for the same secret, timestamp and body.
  it("HMAC-SHA256 signature of '<timestamp>.<body>' in hex", () => {
    expect(signGamingRequest("s3cret", 1700000000, '{"a":1}')).toBe(
      "1698a50bc74d1ff1db85c4e0a5297c2ad9fdba245d5737cdb789e4cc6e098940"
    );
  });
});

describe("postToGamingApp", () => {
  it("does not call Nextcloud when no secret is configured", async () => {
    vi.stubEnv("NEXTCLOUD_GAMING_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await postToGamingApp("score", { a: 1 }, "c=1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the exact signed body, the session cookie and the OCS headers", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await postToGamingApp("notify", { userId: "ana", score: 3 }, "nc_session=abc");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://cloud.example/ocs/v2.php/apps/gaming/api/v1/notify");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"userId":"ana","score":3}');
    expect(headers[TIMESTAMP_HEADER]).toBe(String(NOW / 1000));
    expect(headers[SIGNATURE_HEADER]).toBe(
      signGamingRequest("s3cret", NOW / 1000, init.body as string)
    );
    expect(headers.Cookie).toBe("nc_session=abc");
    expect(headers["OCS-APIRequest"]).toBe("true");
  });
});
