// Time format shared between client (leaderboard/hooks) and server
// (Nextcloud activity/notifications), so Tetris is always shown as
// MM:SS.mmm instead of the raw number of ms.
export function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis
      .toString()
      .padStart(3, "0")}`;
  }
  return `${seconds}.${millis.toString().padStart(3, "0")}s`;
}
