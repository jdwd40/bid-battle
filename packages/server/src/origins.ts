/** Which browser origins may open a Socket.IO connection. */

/** The local dev origins: the Vite dev server (port 5173) and the server's own port, on localhost and 127.0.0.1. */
export function devOrigins(ownPort: number | undefined): string[] {
  const ports = [5173, ...(ownPort ? [ownPort] : [])];
  return ports.flatMap((p) => [`http://localhost:${p}`, `http://127.0.0.1:${p}`]);
}

/** Parses a comma-separated origin list (e.g. the ALLOWED_ORIGINS env var); blank means unset. */
export function parseAllowedOrigins(value: string | undefined): string[] | undefined {
  const list = (value ?? '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  return list.length ? list : undefined;
}

/**
 * Checks a handshake's `Origin` header against the configured list, or the dev origins when none
 * is configured. Requests without an Origin header come from non-browser clients, which origins
 * can't restrict anyway.
 */
export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[] | undefined, ownPort: number | undefined): boolean {
  if (!origin) return true;
  return (allowedOrigins ?? devOrigins(ownPort)).includes(origin);
}
