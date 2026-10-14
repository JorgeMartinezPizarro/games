import { useEffect, useState, type RefObject } from "react";

// true while the ref's <audio> is playing. `source` identifies the current
// audio: the element is remounted every round, so we have to re-attach the
// listeners each time it changes.
export function useAudioPlaying(audioRef: RefObject<HTMLAudioElement | null>, source: string | undefined) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    setPlaying(Boolean(audio && !audio.paused && !audio.ended));
    if (!audio) return;

    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    audio.addEventListener("playing", on);
    audio.addEventListener("pause", off);
    audio.addEventListener("ended", off);
    return () => {
      audio.removeEventListener("playing", on);
      audio.removeEventListener("pause", off);
      audio.removeEventListener("ended", off);
    };
  }, [audioRef, source]);

  return playing;
}
