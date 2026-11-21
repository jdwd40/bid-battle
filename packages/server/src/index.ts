import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MatchConfig } from '@bid-battle/engine';
import { parseAllowedOrigins } from './origins.js';
import { createGameServer } from './server.js';

/** A numeric env var, or undefined when unset so the caller's default applies. */
const envNumber = (name: string) => (process.env[name] !== undefined ? Number(process.env[name]) : undefined);

const port = envNumber('PORT') ?? 3001;
const botDelayMs = envNumber('BOT_DELAY_MS') ?? 900;
const timers: Partial<MatchConfig['timers']> = {};
for (const [env, key] of [
  ['QUOTE_PREP_MS', 'quotePrepMs'],
  ['TURN_MS', 'turnMs'],
  ['COUNTER_MS', 'counterMs'],
  ['REVIEW_MS', 'reviewMs'],
] as const) {
  const ms = envNumber(env);
  if (ms !== undefined) timers[key] = ms;
}
const rounds = envNumber('ROUNDS');

// Abuse limits; unset variables keep the defaults in limits.ts.
const limits = {
  roomsPerIp: envNumber('ROOMS_PER_IP'),
  roomWindowMs: envNumber('ROOM_WINDOW_MS'),
  maxOpenRooms: envNumber('MAX_OPEN_ROOMS'),
  messagesPerSecond: envNumber('MESSAGES_PER_SECOND'),
  clientIpHeader: process.env.CLIENT_IP_HEADER || undefined,
};

const staticDir = process.env.STATIC_DIR ?? resolve(process.cwd(), 'packages/web/dist');

// timers holds only the overridden ones; the engine fills the rest from its defaults
const server = createGameServer({
  botDelayMs,
  config: { ...(rounds ? { rounds } : {}), ...(Object.keys(timers).length ? { timers: timers as MatchConfig['timers'] } : {}) },
  staticDir: existsSync(staticDir) ? staticDir : undefined,
  audit: process.env.AUDIT === '1',
  limits,
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
});

server.listen(port).then((p) => {
  console.log(`Bid Battle server listening on http://localhost:${p}` + (existsSync(staticDir) ? ` (serving ${staticDir})` : ''));
  console.log('Rooms are in memory only: restarting the server clears all active matches.');
});

// Stop signal (systemd sends SIGTERM on stop and restart): warn every room, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => void server.shutdown().then(() => process.exit(0)));
