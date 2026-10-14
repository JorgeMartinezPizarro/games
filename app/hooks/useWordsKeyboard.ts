import { useEffect } from "react";

// Words shortcuts: 1-4 pick an answer, space replays the audio.
export function useWordsKeyboard({
  enabled,
  choices,
  onChoice,
  onReplay,
}: {
  enabled: boolean;
  choices: string[];
  onChoice: (choice: string) => void;
  onReplay: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      // The target may not be an element (window, document).
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select")) return;

      if (event.key === " ") {
        event.preventDefault();
        onReplay();
        return;
      }
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < choices.length) {
        event.preventDefault();
        onChoice(choices[index]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, choices, onChoice, onReplay]);
}
