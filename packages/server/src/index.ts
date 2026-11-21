import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGameServer, parseAllowedOrigins } from './server.js';

const port = Number(process.env.PORT ?? 3001);
const botDelayMs = process.env.BOT_DELAY_MS !== undefined ? Number(process.env.BOT_DELAY_MS) : 900;
const timers: Record<string, number> = {};
for (const [env, key] of [
  ['QUOTE_PREP_MS', 'quotePrepMs'],
  ['TURN_MS', 'turnMs'],
  ['COUNTER_MS', 'counterMs'],
  ['REVIEW_MS', 'reviewMs'],
] as const) {
  if (process.env[env] !== undefined) timers[key] = Number(process.env[env]);
}
const rounds = process.env.ROUNDS !== undefined ? Number(process.env.ROUNDS) : undefined;

// Abuse limits; unset variables keep the defaults in limits.ts.
const envNumber = (name: string) => (process.env[name] !== undefined ? Number(process.env[name]) : undefined);
const limits = {
  roomsPerIp: envNumber('ROOMS_PER_IP'),
  roomWindowMs: envNumber('ROOM_WINDOW_MS'),
  maxOpenRooms: envNumber('MAX_OPEN_ROOMS'),
  messagesPerSecond: envNumber('MESSAGES_PER_SECOND'),
  clientIpHeader: process.env.CLIENT_IP_HEADER || undefined,
};

const staticDir = process.env.STATIC_DIR ?? resolve(process.cwd(), 'packages/web/dist');

const server = createGameServer({
  botDelayMs,
  config: { ...(rounds ? { rounds } : {}), ...(Object.keys(timers).length ? { timers: timers as any } : {}) },
  staticDir: existsSync(staticDir) ? staticDir : undefined,
  audit: process.env.AUDIT === '1',
  limits,
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
});

server.listen(port).then((p) => {
  console.log(`Bid Battle server listening on http://localhost:${p}` + (existsSync(staticDir) ? ` (serving ${staticDir})` : ''));
  console.log('Rooms are in memory only: restarting the server clears all active matches.');
});
