import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { seededRng } from '@bid-battle/engine';
import { FakeClock } from './clock.js';
import { createGameServer, type GameServerOptions } from './server.js';

let server: ReturnType<typeof createGameServer> | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await server?.close();
  server = undefined;
});

async function start(opts: GameServerOptions) {
  server = createGameServer({ botDelayMs: 5, rng: seededRng(7), ...opts });
  return server.listen(0, '127.0.0.1');
}

/** A real client; `ip` is sent through the trusted client-IP header. */
function client(port: number, ip?: string): Socket {
  const s = connect(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: ip ? { 'X-Real-IP': ip } : undefined,
  });
  sockets.push(s);
  return s;
}

function emit<T = any>(s: Socket, ev: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => s.emit(ev, payload, (res: T) => resolve(res)));
}

describe('room creation limits', () => {
  it('refuses a visitor over the per-IP limit and allows them again after the window', async () => {
    const clock = new FakeClock();
    const port = await start({
      clock,
      limits: { roomsPerIp: 2, roomWindowMs: 60_000, clientIpHeader: 'X-Real-IP' },
    });
    const a = client(port, '203.0.113.1');
    const b = client(port, '203.0.113.2');

    expect((await emit(a, 'createRoom', { name: 'A1' })).ok).toBe(true);
    clock.advance(1_000);
    expect((await emit(a, 'createRoom', { name: 'A2' })).ok).toBe(true);
    const refused = await emit(a, 'createRoom', { name: 'A3' });
    expect(refused).toEqual({ ok: false, error: expect.stringMatching(/too many rooms/i) });

    // Another visitor is unaffected.
    expect((await emit(b, 'createRoom', { name: 'B1' })).ok).toBe(true);

    // The first creation leaves the window, freeing one slot only.
    clock.advance(59_000);
    expect((await emit(a, 'createRoom', { name: 'A4' })).ok).toBe(true);
    expect((await emit(a, 'createRoom', { name: 'A5' })).ok).toBe(false);
  });

  it('refuses new rooms once the open-room cap is reached, and allows one when a room closes', async () => {
    const port = await start({ clock: new FakeClock(), limits: { maxOpenRooms: 2, clientIpHeader: 'X-Real-IP' } });
    const a = client(port, '198.51.100.1');
    const b = client(port, '198.51.100.2');
    const c = client(port, '198.51.100.3');

    const first = await emit(a, 'createRoom', { name: 'A' });
    expect(first.ok).toBe(true);
    const second = await emit(b, 'createRoom', { name: 'B' });
    expect(second.ok).toBe(true);
    const refused = await emit(c, 'createRoom', { name: 'C' });
    expect(refused).toEqual({ ok: false, error: expect.stringMatching(/server is full/i) });

    // Joining an existing room is still allowed at the cap.
    expect((await emit(c, 'joinRoom', { name: 'C', code: first.code })).ok).toBe(true);

    // B leaves, closing their room, so a new one fits.
    expect((await emit(b, 'leaveRoom', { token: second.token })).ok).toBe(true);
    const d = client(port, '198.51.100.4');
    expect((await emit(d, 'createRoom', { name: 'D' })).ok).toBe(true);
  });
});

describe('message rate limit', () => {
  it('answers a burst over the rate with errors, without disconnecting, and recovers next second', async () => {
    const clock = new FakeClock();
    const port = await start({ clock, limits: { messagesPerSecond: 5 } });
    const a = client(port);
    const created = await emit(a, 'createRoom', { name: 'A' }); // message 1 of this second

    const burst = await Promise.all(
      Array.from({ length: 9 }, (_, i) => emit(a, 'setSeat', { token: created.token, seat: 1 + (i % 3), difficulty: 'easy' })),
    );
    const refused = burst.filter((r) => !r.ok);
    expect(burst.filter((r) => r.ok)).toHaveLength(4);
    expect(refused).toHaveLength(5);
    for (const r of refused) expect(r.error).toMatch(/too many actions/i);
    expect(a.connected).toBe(true);

    clock.advance(1_000);
    expect(await emit(a, 'setSeat', { token: created.token, seat: 1, difficulty: 'hard' })).toEqual({ ok: true });
  });
});

