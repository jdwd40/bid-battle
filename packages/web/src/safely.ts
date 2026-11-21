/**
 * Runs a browser call that can throw, such as localStorage (private mode, blocked site data) or
 * URL and history access, and returns `fallback` instead of throwing.
 */
export function safely<T>(call: () => T, fallback: T): T {
  try {
    return call();
  } catch {
    return fallback;
  }
}
