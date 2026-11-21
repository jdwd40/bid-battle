import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { seededRng } from '@bid-battle/engine';
import { FakeClock } from './clock.js';
import { createGameServer, type GameServerOptions } from './server.js';

let server: ReturnType<typeof createGameServer> | undefined;
let port: number;
const clients: Socket[] = [];

async function start(clock: FakeClock, opts: Partial<GameServerOptions> = {}) {
  server = createGameServer({ clock, botDelayMs: 5, rng: seededRng(7), ...opts });
  port = await server.listen(0, '127.0.0.1');
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = undefined;
});

function client(): Promise<Socket> {
  const s = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(s);
  return new Promise((resolve) => s.on('connect', () => resolve(s)));
}

function emit<T>(s: Socket, ev: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => s.emit(ev, payload, (res: T) => resolve(res)));
}

async function status(): Promise<{ activeMatches: number; openRooms: number }> {
  const res = await fetch(`http://127.0.0.1:${port}/status`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('application/json');
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Advance fake time in steps, letting socket I/O run between them, until `done()` holds. */
async function advanceUntil(clock: FakeClock, done: () => Promise<boolean>, stepMs = 30_000, maxSteps = 400) {
  for (let i = 0; i < maxSteps; i++) {
    if (await done()) return;
    clock.advance(stepMs);
    await sleep(1);
  }
  throw new Error('condition never reached');
}

describe('status route', () => {
  it('counts an active match from start until it completes', async () => {
    const clock = new FakeClock();
    await start(clock, { config: { rounds: 1 } });
    expect(await status()).toEqual({ activeMatches: 0, openRooms: 0 });

    const a = await client();
    const created = await emit<any>(a, 'createRoom', { name: 'Alice' });
    expect(created.ok).toBe(true);
    expect(await status()).toEqual({ activeMatches: 0, openRooms: 1 });

    expect((await emit<any>(a, 'startMatch', { token: created.token })).ok).toBe(true);
    expect(await status()).toEqual({ activeMatches: 1, openRooms: 1 });

    // Alice stays connected but never acts; the phase timers run the one-round match to its end.
    await advanceUntil(clock, async () => (await status()).activeMatches === 0);
    expect(await status()).toEqual({ activeMatches: 0, openRooms: 1 });
  });

  it('stops counting a match once its idle room is swept', async () => {
    const clock = new FakeClock();
    await start(clock, { idleRoomMs: 1_000 });
    const a = await client();
    const created = await emit<any>(a, 'createRoom', { name: 'Alice' });
    expect((await emit<any>(a, 'startMatch', { token: created.token })).ok).toBe(true);
    expect(await status()).toEqual({ activeMatches: 1, openRooms: 1 });

    a.close();
    await sleep(30);
    clock.advance(2_000);
    expect(await status()).toEqual({ activeMatches: 0, openRooms: 0 });
  });
});

describe('shutdown', () => {
  it('tells every connected client the server is restarting, refuses new rooms, then closes', async () => {
    const clock = new FakeClock();
    await start(clock);
    const a = await client();
    const created = await emit<any>(a, 'createRoom', { name: 'Alice' });
    expect((await emit<any>(a, 'startMatch', { token: created.token })).ok).toBe(true);
    const b = await client(); // connected, not in a room yet

    const notices = [a, b].map((s) => new Promise<string>((resolve) => s.once('roomClosed', resolve)));
    const disconnected = [a, b].map((s) => new Promise<void>((resolve) => s.once('disconnect', () => resolve())));
    const shutdown = server!.shutdown();
    for (const reason of await Promise.all(notices)) expect(reason).toMatch(/server is restarting/i);

    const refused = await emit<any>(b, 'createRoom', { name: 'Bob' });
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/restarting/i);

    clock.advance(10_000);
    await shutdown;
    await Promise.all(disconnected);
    server = undefined; // already closed
  });
});
