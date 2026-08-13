/**
 * Turn a millisecond average into one readable line for the admin UI.
 *
 * Examples:
 *   511687      → "8m 32s"
 *   86866997.5  → "1d 0h 7m 47s"
 */
export function formatDurationMs(
  ms: number | null | undefined,
): string | null {
  if (ms == null || Number.isNaN(ms) || ms < 0) return null;

  const totalSeconds = Math.round(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  // Drop leading zero units so short durations stay compact.
  if (days === 0 && hours === 0) {
    return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
  }
  if (days === 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
