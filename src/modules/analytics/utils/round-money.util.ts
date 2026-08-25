/** Round a money amount to two decimal places (avoids IEEE leftover like 6422.299999999999). */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Round a 0–1 rate to four decimal places (e.g. 0.2223 = 22.23%). */
export function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}
