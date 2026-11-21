import type { Clock } from './clock.js';

/** Abuse limits for the public server. Every window is measured on the injected clock. */
export interface LimitOptions {
  /** Rooms one client IP may create per `roomWindowMs` (default 5). */
  roomsPerIp?: number;
  /** Length of the per-IP room-creation window in ms (default 10 minutes). */
  roomWindowMs?: number;
  /** Rooms open at once across the server (default 100). */
  maxOpenRooms?: number;
  /** Socket messages one connection may send per second (default 20). */
  messagesPerSecond?: number;
  /** Trusted header carrying the client IP (e.g. `Fly-Client-IP`). Unset: the socket's remote address. */
  clientIpHeader?: string;
}

export const DEFAULT_LIMITS = {
  roomsPerIp: 5,
  roomWindowMs: 10 * 60_000,
  maxOpenRooms: 100,
  messagesPerSecond: 20,
} as const;

export const LIMIT_ERRORS = {
  roomsPerIp: 'Too many rooms created from your connection. Please wait a few minutes and try again.',
  maxOpenRooms: 'The server is full right now. Please try again later.',
  messageRate: 'Too many actions too quickly. Please slow down.',
} as const;

interface Handshake {
  headers: Record<string, string | string[] | undefined>;
  address: string;
}

export function createLimits(clock: Clock, opts: LimitOptions = {}) {
  const roomsPerIp = opts.roomsPerIp ?? DEFAULT_LIMITS.roomsPerIp;
  const roomWindowMs = opts.roomWindowMs ?? DEFAULT_LIMITS.roomWindowMs;
  const maxOpenRooms = opts.maxOpenRooms ?? DEFAULT_LIMITS.maxOpenRooms;
  const messagesPerSecond = opts.messagesPerSecond ?? DEFAULT_LIMITS.messagesPerSecond;
  const ipHeader = opts.clientIpHeader?.toLowerCase();
  const creations = new Map<string, number[]>(); // ip -> creation timestamps inside the window

  function recent(ip: string): number[] {
    const cutoff = clock.now() - roomWindowMs;
    const kept = (creations.get(ip) ?? []).filter((t) => t > cutoff);
    if (kept.length) creations.set(ip, kept);
    else creations.delete(ip);
    return kept;
  }

  return {
    clientIp(handshake: Handshake): string {
      const raw = ipHeader ? handshake.headers[ipHeader] : undefined;
      const value = Array.isArray(raw) ? raw[0] : raw;
      return value?.trim() || handshake.address;
    },

    /** Checks the room-creation limits; on success records the creation. Returns an error message when refused. */
    claimRoom(ip: string, openRooms: number): string | null {
      if (openRooms >= maxOpenRooms) return LIMIT_ERRORS.maxOpenRooms;
      const times = recent(ip);
      if (times.length >= roomsPerIp) return LIMIT_ERRORS.roomsPerIp;
      creations.set(ip, [...times, clock.now()]);
      return null;
    },

    /** A per-connection fixed one-second message budget. `allow()` is false once the budget is spent. */
    messageMeter() {
      let windowStart = -Infinity;
      let count = 0;
      return {
        allow(): boolean {
          const now = clock.now();
          if (now - windowStart >= 1000) {
            windowStart = now;
            count = 0;
          }
          return ++count <= messagesPerSecond;
        },
      };
    },
  };
}
