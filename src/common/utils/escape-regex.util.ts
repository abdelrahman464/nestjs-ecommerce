/**
 * Escape user input before embedding it in a RegExp / Mongo `$regex`
 * so characters like `.` `*` `+` are treated literally, not as patterns.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
