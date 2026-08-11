/** Parses JWT-style durations like `15m`, `2h`, `30d` into whole seconds. */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/i.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use formats like 15m, 2h, or 30d.`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1 / 1000,
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return Math.max(1, Math.floor(amount * multipliers[unit]));
}
