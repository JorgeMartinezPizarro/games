import { useEffect, useState, type RefObject } from "react";

// true mientras el <audio> del ref está sonando. `source` identifica el audio
// actual: el elemento se vuelve a montar con cada ronda, así que hay que
// volver a escucharlo cada vez que cambia.
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
