import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGameServer } from './server.js';

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

const staticDir = process.env.STATIC_DIR ?? resolve(process.cwd(), 'packages/web/dist');

const server = createGameServer({
  botDelayMs,
  config: { ...(rounds ? { rounds } : {}), ...(Object.keys(timers).length ? { timers: timers as any } : {}) },
  staticDir: existsSync(staticDir) ? staticDir : undefined,
  audit: process.env.AUDIT === '1',
});

server.listen(port).then((p) => {
  console.log(`Bid Battle server listening on http://localhost:${p}` + (existsSync(staticDir) ? ` (serving ${staticDir})` : ''));
  console.log('Rooms are in memory only: restarting the server clears all active matches.');
});
