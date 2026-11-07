import { describe, expect, it } from 'vitest';
import { seededRng } from '@bid-battle/engine';
import { FakeClock } from './clock.js';
import { Room } from './room.js';

function makeRoom(seed = 1) {
  const clock = new FakeClock();
  let n = 0;
  const changes: number[] = [];
  const room = new Room('TEST1', {
    clock,
    botDelayMs: 10,
    rng: seededRng(seed),
    tokenFactory: () => `tok${++n}`,
    onChange: () => changes.push(clock.now()),
  });
  return { room, clock, changes };
}

function cmd(room: Room, token: string, action: any, id = `c${Math.random()}`) {
  const pv = room.engine!.state.phaseVersion;
  return room.command({ token, commandId: id, phaseVersion: pv, action });
}

describe('Room lobby', () => {
  it('seats humans, defaults the rest to Normal bots and lets the host tune difficulty', () => {
    const { room } = makeRoom();
    const a = room.addPlayer('Alice');
    const b = room.addPlayer('Bob');
    expect(a).toMatchObject({ ok: true, seat: 0 });
    expect(b).toMatchObject({ ok: true, seat: 1 });
    const lobby = room.lobbyView();
    expect(lobby.seats.map((s) => s.kind)).toEqual(['human', 'human', 'bot', 'bot']);
    expect(lobby.seats[0].isHost).toBe(true);
    expect(room.setSeat('tok2', 2, 'hard').ok).toBe(false);
    expect(room.setSeat('tok1', 2, 'hard').ok).toBe(true);
    expect(room.setSeat('tok1', 1, 'hard').ok).toBe(false);
    expect(room.lobbyView().seats[2].difficulty).toBe('hard');
    expect(room.addPlayer('   ').ok).toBe(false);
  });

  it('transfers host when the host leaves the lobby and frees the seat', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    room.removePlayer('tok1');
    expect(room.hostToken).toBe('tok2');
    expect(room.lobbyView().seats[0].kind).toBe('bot');
    expect(room.addPlayer('Cara')).toMatchObject({ ok: true, seat: 0 });
  });

  it('rejects new joins after the match starts', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice');
    expect(room.start('tok1').ok).toBe(true);
    expect(room.addPlayer('Late').ok).toBe(false);
    expect(room.start('tok1').ok).toBe(false);
  });
});

describe('Room match driving', () => {
  it('plays a complete solo match through the server path with fake time', () => {
    const { room, clock } = makeRoom(3);
    room.addPlayer('Solo');
    expect(room.start('tok1').ok).toBe(true);
    const engine = room.engine!;
    expect(engine.phase).toBe('QUOTE_PREPARATION');
    // bots act after the presentation delay
    clock.advance(10);
    expect(engine.state.seats.slice(1).every((s) => s.submission?.confirmed)).toBe(true);
    expect(engine.state.seats[0].submission?.confirmed).toBe(false);
    // human never acts: everything resolves through timeouts and bot actions
    let guard = 0;
    while (engine.phase !== 'MATCH_COMPLETE' && guard++ < 10_000) clock.advance(1000);
    expect(engine.phase).toBe('MATCH_COMPLETE');
    expect(engine.state.roundHistory).toHaveLength(10);
    expect(engine.state.seats.reduce((a, s) => a + s.balance, 0)).toBe(400);
    expect(engine.state.seats[0].balance).toBe(100); // passive human never trades
    const passes = engine.state.events.filter((e) => e.event.type === 'PASS' && (e.event as any).seat === 0 && (e.event as any).reason === 'timeout');
    expect(passes).toHaveLength(30);
  });

  it('human quotes and trades, duplicate command ids do not duplicate trades', () => {
    const { room, clock } = makeRoom(5);
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    room.start('tok1');
    const engine = room.engine!;
    clock.advance(10);
    expect(cmd(room, 'tok1', { type: 'SUBMIT_QUOTE', bid: 20, ask: 50, confirm: true }).ok).toBe(true);
    expect(cmd(room, 'tok2', { type: 'SUBMIT_QUOTE', ask: 40, confirm: true }).ok).toBe(true);
    expect(engine.phase).toBe('TRADING');
    // advance until it's Alice's turn (bots act in between)
    let guard = 0;
    while (engine.state.turnSeat !== 0 && engine.phase === 'TRADING' && guard++ < 50) clock.advance(10);
    expect(engine.state.turnSeat).toBe(0);
    const bobAsk = engine.state.seats[1].quote.ask;
    if (bobAsk !== undefined) {
      const tradesBefore = engine.state.events.filter((e) => e.event.type === 'TRADE').length;
      const first = cmd(room, 'tok1', { type: 'BUY', target: 1, price: bobAsk }, 'dup');
      expect(first.ok).toBe(true);
      const second = room.command({ token: 'tok1', commandId: 'dup', phaseVersion: engine.state.phaseVersion, action: { type: 'BUY', target: 1, price: bobAsk } });
      expect(second).toEqual(first);
      expect(engine.state.events.filter((e) => e.event.type === 'TRADE').length).toBe(tradesBefore + 1);
      expect(engine.state.seats[0].position).toBe(1);
    } else {
      expect(cmd(room, 'tok1', { type: 'PASS' }).ok).toBe(true);
    }
  });

  it('rejects wrong-seat, stale-phase and malformed commands', () => {
    const { room, clock } = makeRoom(2);
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    room.start('tok1');
    const engine = room.engine!;
    clock.advance(10);
    cmd(room, 'tok1', { type: 'SUBMIT_QUOTE', bid: 20, ask: 50, confirm: true });
    const staleVersion = engine.state.phaseVersion;
    cmd(room, 'tok2', { type: 'SUBMIT_QUOTE', confirm: true });
    expect(engine.phase).toBe('TRADING');
    expect(room.command({ token: 'tok1', commandId: 'x1', phaseVersion: staleVersion, action: { type: 'PASS' } })).toMatchObject({ ok: false, error: expect.stringContaining('moved on') });
    expect(room.command({ token: 'nobody', commandId: 'x2', phaseVersion: engine.state.phaseVersion, action: { type: 'PASS' } }).ok).toBe(false);
    expect(room.command({ token: 'tok1', commandId: 'x3', phaseVersion: engine.state.phaseVersion, action: { type: 'BUY', target: 'a', price: 1 } as any })).toMatchObject({ ok: false, error: expect.stringContaining('whole numbers') });
    expect(room.command({ token: 'tok1', commandId: 'x4', phaseVersion: engine.state.phaseVersion, action: { type: 'HACK' } as any }).ok).toBe(false);
    expect(room.command({ token: 'tok1', commandId: '', phaseVersion: engine.state.phaseVersion, action: { type: 'PASS' } }).ok).toBe(false);
    const notMyTurn = engine.state.turnSeat === 0 ? 'tok2' : 'tok1';
    expect(cmd(room, notMyTurn, { type: 'PASS' })).toMatchObject({ ok: false, error: expect.stringContaining('turn') });
  });

  it('AI takes over a disconnected seat at the next boundary and the human reclaims it on reconnect', () => {
    const { room, clock } = makeRoom(4);
    room.addPlayer('Alice');
    room.start('tok1');
    const engine = room.engine!;
    clock.advance(10);
    expect(engine.state.seats[0].submission?.confirmed).toBe(false);
    const card = engine.state.seats[0].privateCard;
    room.disconnect('tok1');
    expect(room.viewFor('tok1')!.aiControlled[0]).toBe(true);
    clock.advance(10); // takeover bot submits a quote for seat 0
    expect(engine.state.seats[0].submission?.confirmed ?? engine.phase === 'TRADING').toBeTruthy();
    expect(engine.phase).toBe('TRADING');
    // reconnect: seat, card and balance preserved, no restart
    const p = room.reconnect('tok1');
    expect(p?.seat).toBe(0);
    expect(engine.state.seats[0].privateCard).toBe(card);
    expect(engine.state.round).toBe(1);
    expect(room.viewFor('tok1')!.aiControlled[0]).toBe(false);
    // the human now has to act on their own: drive until the engine waits on seat 0 during trading
    let guard = 0;
    while (!(engine.phase === 'TRADING' && engine.awaitingSeats().includes(0)) && guard++ < 200) {
      if (engine.phase === 'QUOTE_PREPARATION' && !engine.state.seats[0].submission?.confirmed) {
        expect(cmd(room, 'tok1', { type: 'SUBMIT_QUOTE', confirm: true }).ok).toBe(true);
      } else {
        clock.advance(10);
      }
    }
    expect(engine.awaitingSeats()).toEqual([0]);
    const versionBefore = engine.state.version;
    clock.advance(1000);
    expect(engine.state.version).toBe(versionBefore); // still waiting on the human, no AI action for the seat
    const pc = engine.state.pendingCounter;
    const action = pc && pc.target === 0 ? { type: 'RESPOND_COUNTER', counterId: pc.id, accept: false } : { type: 'PASS' };
    expect(cmd(room, 'tok1', action).ok).toBe(true);
  });

  it('views never contain other private cards, hidden community cards or sealed submissions', () => {
    const { room, clock } = makeRoom(6);
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    room.start('tok1');
    const engine = room.engine!;
    clock.advance(10);
    cmd(room, 'tok2', { type: 'SUBMIT_QUOTE', bid: 17, ask: 63, confirm: true });
    const view = room.viewFor('tok1')!;
    const g = view.game!;
    expect(g.seats[0].privateCard).toBe(engine.state.seats[0].privateCard);
    expect(g.seats[1].privateCard).toBeNull();
    expect(g.communityCards).toEqual([null, null, null]);
    expect(g.seats[1].quote).toEqual({});
    expect(g.seats[1].submissionConfirmed).toBe(true);
    const json = JSON.stringify(view);
    expect(json).not.toContain('unused');
    expect(json).not.toMatch(/"bid":17/);
    expect(json).not.toMatch(/"ask":63/);
    for (const s of engine.state.seats.slice(1)) {
      // the other private card values must not appear as privateCard anywhere in Alice's view
      expect(g.seats.filter((x) => x.privateCard === s.privateCard && x.index !== 0)).toHaveLength(0);
    }
  });
});
