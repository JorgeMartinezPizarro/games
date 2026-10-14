// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWordsKeyboard } from "./useWordsKeyboard";

const choices = ["paladin", "calmness", "pigpen", "uneasily"];

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true, ...init }));
}

afterEach(cleanup);

describe("useWordsKeyboard", () => {
  it("1-4 pick the corresponding answer and space replays the audio", () => {
    const onChoice = vi.fn();
    const onReplay = vi.fn();
    renderHook(() => useWordsKeyboard({ enabled: true, choices, onChoice, onReplay }));

    press("2");
    press("4");
    press(" ");

    expect(onChoice.mock.calls).toEqual([["calmness"], ["uneasily"]]);
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys, key combinations and held-down presses", () => {
    const onChoice = vi.fn();
    renderHook(() => useWordsKeyboard({ enabled: true, choices, onChoice, onReplay: vi.fn() }));

    press("5");
    press("a");
    press("1", { ctrlKey: true });
    press("1", { repeat: true });

    expect(onChoice).not.toHaveBeenCalled();
  });

  it("doesn't listen to the keyboard when disabled", () => {
    const onChoice = vi.fn();
    renderHook(() => useWordsKeyboard({ enabled: false, choices, onChoice, onReplay: vi.fn() }));

    press("1");

    expect(onChoice).not.toHaveBeenCalled();
  });
});
