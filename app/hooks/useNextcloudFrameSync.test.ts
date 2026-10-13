// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { NAVIGATE_MESSAGE, useNextcloudFrameSync } from "./useNextcloudFrameSync";

function embedIn(parent: { postMessage: ReturnType<typeof vi.fn> }) {
  vi.spyOn(window, "parent", "get").mockReturnValue(parent as unknown as Window);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  pathname.current = "/";
  window.history.replaceState(null, "", "/");
});

describe("useNextcloudFrameSync", () => {
  it("no hace nada si la app no está dentro de un iframe", () => {
    const postMessage = vi.spyOn(window, "postMessage");

    renderHook(() => useNextcloudFrameSync());

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("dentro de un iframe, avisa al padre de la ruta actual con su query", () => {
    const parent = { postMessage: vi.fn() };
    embedIn(parent);
    pathname.current = "/pages/games/tetris";
    window.history.replaceState(null, "", "/bookmarks/pages/games/tetris?from=menu");

    renderHook(() => useNextcloudFrameSync());

    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: NAVIGATE_MESSAGE, path: "/pages/games/tetris", search: "?from=menu" },
      "*"
    );
  });

  it("vuelve a avisar en cada navegación cliente", () => {
    const parent = { postMessage: vi.fn() };
    embedIn(parent);

    const { rerender } = renderHook(() => useNextcloudFrameSync());
    pathname.current = "/pages/games/chess";
    rerender();

    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "/pages/games/chess" }),
      "*"
    );
  });
});
