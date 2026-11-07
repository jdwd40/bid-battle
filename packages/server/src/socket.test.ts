import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { seededRng } from '@bid-battle/engine';
import { FakeClock } from './clock.js';
import type { ClientView } from './protocol.js';
import { createGameServer } from './server.js';

const clock = new FakeClock();
let server: ReturnType<typeof createGameServer>;
let port: number;

beforeAll(async () => {
  server = createGameServer({ clock, botDelayMs: 5, rng: seededRng(11) });
  port = await server.listen(0, '127.0.0.1');
});

afterAll(async () => {
  await server.close();
});

function client(): Socket {
  return connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
}

function emit<T>(s: Socket, ev: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => s.emit(ev, payload, (res: T) => resolve(res)));
}

function nextView(s: Socket, pred: (v: ClientView) => boolean = () => true): Promise<ClientView> {
  return new Promise((resolve) => {
    const handler = (v: ClientView) => {
      if (pred(v)) {
        s.off('view', handler);
        resolve(v);
      }
    };
    s.on('view', handler);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('socket transport', () => {
  it('two clients create/join, play a trade, agree on state, and reconnect safely', async () => {
    const a = client();
    const b = client();
    const created = await emit<any>(a, 'createRoom', { name: 'Alice' });
    expect(created.ok).toBe(true);
    const joined = await emit<any>(b, 'joinRoom', { name: 'Bob', code: created.code.toLowerCase() });
    expect(joined.ok).toBe(true);
    expect(joined.seat).toBe(1);

    // Bob cannot act for Alice's token from his socket.
    const spoof = await emit<any>(b, 'startMatch', { token: created.token });
    expect(spoof.ok).toBe(false);
    const notHost = await emit<any>(b, 'setSeat', { token: joined.token, seat: 2, difficulty: 'hard' });
    expect(notHost.ok).toBe(false);
    expect((await emit<any>(a, 'setSeat', { token: created.token, seat: 2, difficulty: 'hard' })).ok).toBe(true);

    const viewPromise = nextView(a, (v) => v.game !== null);
    expect((await emit<any>(a, 'startMatch', { token: created.token })).ok).toBe(true);
    const va = await viewPromise;
    expect(va.game!.phase).toBe('QUOTE_PREPARATION');
    expect(va.room.seats[2].difficulty).toBe('hard');
    expect(va.game!.seats[0].privateCard).not.toBeNull();
    expect(va.game!.seats[1].privateCard).toBeNull();

    // late joiner rejected
    const c = client();
    expect((await emit<any>(c, 'joinRoom', { name: 'Late', code: created.code })).ok).toBe(false);
    c.close();

    clock.advance(10); // bots quote
    const pv = va.game!.phaseVersion;
    const qa = await emit<any>(a, 'command', { token: created.token, commandId: 'qa', phaseVersion: pv, action: { type: 'SUBMIT_QUOTE', bid: 25, ask: 45, confirm: true } });
    expect(qa.ok).toBe(true);
    // Bob's view must not reveal Alice's sealed quote
    const vbSealed = await emit<any>(b, 'command', { token: joined.token, commandId: 'noop', phaseVersion: pv, action: { type: 'READY' } });
    expect(vbSealed.ok).toBe(false);
    const tradingPromise = nextView(b, (v) => v.game?.phase === 'TRADING');
    const qb = await emit<any>(b, 'command', { token: joined.token, commandId: 'qb', phaseVersion: pv, action: { type: 'SUBMIT_QUOTE', ask: 60, confirm: true } });
    expect(qb.ok).toBe(true);
    let vb = await tradingPromise;
    expect(vb.game!.seats[0].quote).toEqual({ bid: 25, ask: 45 });

    // drive to Bob's turn, then Bob buys Alice's ask
    const act = async (s: Socket, token: string, id: string, action: unknown) => {
      const res = await emit<any>(s, 'command', { token, commandId: id, phaseVersion: vb.game!.phaseVersion, action });
      expect(res.ok).toBe(true);
    };
    for (let i = 0; i < 60 && !(vb.game!.turnSeat === 1 && !vb.game!.pendingCounter); i++) {
      const p = nextView(b);
      const g = vb.game!;
      if (g.pendingCounter && g.pendingCounter.target === 0) {
        await act(a, created.token, `ra${i}`, { type: 'RESPOND_COUNTER', counterId: g.pendingCounter.id, accept: false });
      } else if (g.pendingCounter && g.pendingCounter.target === 1) {
        await act(b, joined.token, `rb${i}`, { type: 'RESPOND_COUNTER', counterId: g.pendingCounter.id, accept: false });
      } else if (g.turnSeat === 0) {
        await act(a, created.token, `pass${i}`, { type: 'PASS' });
      } else {
        clock.advance(5);
      }
      vb = await Promise.race([p, sleep(200).then(() => vb)]);
    }
    expect(vb.game!.phase).toBe('TRADING');
    expect(vb.game!.turnSeat).toBe(1);
    const ask = vb.game!.seats[0].quote.ask;
    if (ask !== undefined) {
      const buy = await emit<any>(b, 'command', { token: joined.token, commandId: 'buy1', phaseVersion: vb.game!.phaseVersion, action: { type: 'BUY', target: 0, price: ask } });
      expect(buy.ok).toBe(true);
      const dup = await emit<any>(b, 'command', { token: joined.token, commandId: 'buy1', phaseVersion: vb.game!.phaseVersion, action: { type: 'BUY', target: 0, price: ask } });
      expect(dup).toEqual(buy);
      const stale = await emit<any>(b, 'command', { token: joined.token, commandId: 'buy2', phaseVersion: vb.game!.phaseVersion, action: { type: 'BUY', target: 0, price: ask } });
      expect(stale.ok).toBe(false);
      await sleep(20);
      const room = [...server.rooms.values()][0];
      expect(room.engine!.state.seats[1].position).toBe(1);
      expect(room.engine!.state.seats[0].position).toBe(-1);
    }

    // Reconnect: Bob drops and comes back with his token; seat preserved.
    const room = [...server.rooms.values()][0];
    b.close();
    await sleep(30);
    expect(room.players.get(joined.token)!.connected).toBe(false);
    const b2 = client();
    const vb2Promise = nextView(b2);
    const re = await emit<any>(b2, 'rejoin', { token: joined.token });
    expect(re).toMatchObject({ ok: true, seat: 1, code: created.code });
    expect(room.players.get(joined.token)!.connected).toBe(true);
    const vb2 = await vb2Promise;
    expect(vb2.seat).toBe(1);
    expect(vb2.game!.round).toBe(1);
    expect(vb2.aiControlled[1]).toBe(false);
    // Both clients see the same public state
    const va2 = room.viewFor(created.token)!;
    expect(va2.game!.version).toBe(vb2.game!.version);
    expect(va2.game!.seats.map((s) => s.balance)).toEqual(vb2.game!.seats.map((s) => s.balance));
    expect((await emit<any>(b2, 'rejoin', { token: 'bogus' })).ok).toBe(false);
    a.close();
    b2.close();
  });
});
