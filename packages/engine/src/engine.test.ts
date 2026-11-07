import { describe, expect, it } from 'vitest';
import {
  FULL_DECK,
  GameEngine,
  applyBuy,
  applySell,
  buildBotObservation,
  evaluateQuote,
  expectedTotal,
  pairTradesFifo,
  projectView,
  publicBounds,
  remainingDeck,
  seededRng,
  shuffle,
  simulateMatch,
  worstLoss,
  type SeatSetup,
  type Rng,
} from './index.js';

const zeroRng: Rng = { next: () => 0 }; // first seat 0
const SEATS: SeatSetup[] = ['A', 'B', 'C', 'D'].map((name) => ({ name, isBot: false, difficulty: 'normal' as const }));

/** private A,B,C,D = 10,9,8,6; community 1,2,3 -> V = 39 */
const DECK_39 = [10, 9, 8, 6, 1, 2, 3, 4, 5, 7, 11, 12, 13, 14, 15, -10, -20];

function makeEngine(deck: number[] = DECK_39, opts: { rng?: Rng; config?: any } = {}) {
  const e = new GameEngine(SEATS, { rng: opts.rng ?? zeroRng, deckProvider: () => deck, config: opts.config });
  e.startMatch(0);
  return e;
}

function confirmAll(e: GameEngine, quotes: Record<number, { bid?: number; ask?: number }>, now = 1) {
  for (let s = 0; s < 4; s++) {
    const r = e.apply(s, { type: 'SUBMIT_QUOTE', ...(quotes[s] ?? {}), confirm: true }, now);
    if (!r.ok) throw new Error(`seat ${s}: ${r.error}`);
  }
  expect(e.phase).toBe('TRADING');
}

function ok(r: { ok: boolean; error?: string }) {
  if (!r.ok) throw new Error((r as any).error);
}

describe('deck and deal', () => {
  it('has exactly 17 cards: 1..15, -10, -20 and sums to 90', () => {
    expect(FULL_DECK).toHaveLength(17);
    expect([...FULL_DECK].sort((a, b) => a - b)).toEqual([-20, -10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(FULL_DECK.reduce((a, b) => a + b, 0)).toBe(90);
  });

  it('unconditional expected total is 630/17 and extremes are -15 / 84', () => {
    const mean = remainingDeck([]).reduce((a, b) => a + b, 0) / 17;
    expect(mean * 7).toBeCloseTo(630 / 17, 10);
    expect(publicBounds([])).toEqual({ L: -15, U: 84 });
  });

  it('deals seven unique cards and keeps ten unused', () => {
    const e = new GameEngine(SEATS, { rng: seededRng(7) });
    e.startMatch(0);
    const st = e.state;
    const dealt = [...st.seats.map((s) => s.privateCard!), ...st.communityCards];
    expect(dealt).toHaveLength(7);
    expect(new Set(dealt).size).toBe(7);
    expect(st.unusedCards).toHaveLength(10);
    expect([...dealt, ...st.unusedCards].sort((a, b) => a - b)).toEqual([...FULL_DECK].sort((a, b) => a - b));
  });

  it('shuffle is a permutation', () => {
    const d = shuffle(FULL_DECK, seededRng(3));
    expect([...d].sort((a, b) => a - b)).toEqual([...FULL_DECK].sort((a, b) => a - b));
  });
});

describe('public risk bounds', () => {
  it('tightens with public cards using only public info', () => {
    expect(publicBounds([15])).toEqual({ L: -5, U: 84 });
    expect(publicBounds([-20, -10])).toEqual({ L: -30 + 15, U: -30 + 15 + 14 + 13 + 12 + 11 });
  });

  it('is independent of private cards', () => {
    const a = makeEngine([15, 14, 13, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, -10, -20]);
    const b = makeEngine([-20, -10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(a.bounds()).toEqual(b.bounds());
    const quotes = { 0: { bid: 5, ask: 60 }, 1: {}, 2: {}, 3: {} };
    confirmAll(a, quotes);
    confirmAll(b, quotes);
    for (let s = 0; s < 4; s++) {
      ok(a.apply(s, { type: 'PASS' }, 2));
      ok(b.apply(s, { type: 'PASS' }, 2));
    }
    // After the first reveal, both see the same public card and thus the same bounds.
    expect(a.publicCards()).toEqual([1]);
    expect(b.publicCards()).toEqual([3]);
    expect(a.bounds()).toEqual(publicBounds([1]));
    expect(b.bounds()).toEqual(publicBounds([3]));
  });
});

describe('risk reservation', () => {
  const bounds = publicBounds([]);
  const fresh = { B: 100, q: 0, C: 0 };

  it('buying one at 36 risks 51', () => {
    expect(worstLoss(applyBuy(fresh, 36), bounds)).toBe(51);
    expect(evaluateQuote(fresh, { bid: 36 }, bounds, 2)).toMatchObject({ ok: true, reserved: 51 });
  });

  it('buying two at 36 risks 102 and is forbidden', () => {
    const two = applyBuy(applyBuy(fresh, 36), 36);
    expect(worstLoss(two, bounds)).toBe(102);
    expect(evaluateQuote(applyBuy(fresh, 36), { bid: 36 }, bounds, 2).ok).toBe(false);
  });

  it('buy 32 / sell 36 locks four credits', () => {
    const p = applySell(applyBuy(fresh, 32), 36);
    expect(p.q).toBe(0);
    expect(p.C).toBe(4);
    expect(worstLoss(p, bounds)).toBe(0);
  });

  it('enumerates every fill subset and reserves the maximum', () => {
    const ev = evaluateQuote(fresh, { bid: 30, ask: 40 }, bounds, 2);
    expect(ev.ok).toBe(true);
    expect(ev.reserved).toBe(45); // bid alone: -30 - 15 = -45
    expect(ev.worstSubset).toEqual(['bid']);
    expect(evaluateQuote({ B: 40, q: 0, C: 0 }, { bid: 30, ask: 40 }, bounds, 2).ok).toBe(false);
    expect(evaluateQuote({ B: 45, q: 0, C: 0 }, { bid: 30, ask: 40 }, bounds, 2).ok).toBe(true);
  });

  it('enforces position limits across subsets', () => {
    expect(evaluateQuote({ B: 100, q: 2, C: -40 }, { bid: 10 }, bounds, 2).ok).toBe(false);
    expect(evaluateQuote({ B: 100, q: 2, C: -40 }, { ask: 30 }, bounds, 2).ok).toBe(true);
  });

  it('handles negative prices without free money', () => {
    const sold = applySell(fresh, -5); // short at -5: loses when V is high
    expect(worstLoss(sold, bounds)).toBe(89);
    const bought = applyBuy(fresh, -10); // long at -10: loses only if V < -10
    expect(worstLoss(bought, bounds)).toBe(5);
    expect(evaluateQuote(fresh, { bid: -14, ask: -12 }, bounds, 2).ok).toBe(true);
    expect(evaluateQuote(fresh, { bid: -16 }, bounds, 2).ok).toBe(true); // affordable but...
  });

  it('a zero-balance player cannot take exposure', () => {
    expect(evaluateQuote({ B: 0, q: 0, C: 0 }, { bid: 30 }, bounds, 2).ok).toBe(false);
    expect(evaluateQuote({ B: 0, q: 0, C: 0 }, {}, bounds, 2).ok).toBe(true);
  });
});

describe('quote preparation', () => {
  it('rejects out-of-range, non-integer, crossed and unaffordable quotes with explanations', () => {
    const e = makeEngine();
    expect(e.apply(0, { type: 'SUBMIT_QUOTE', bid: 85, confirm: false }, 1)).toMatchObject({ ok: false });
    expect(e.apply(0, { type: 'SUBMIT_QUOTE', bid: -16, confirm: false }, 1)).toMatchObject({ ok: false });
    expect(e.apply(0, { type: 'SUBMIT_QUOTE', bid: 30.5, confirm: false }, 1)).toMatchObject({ ok: false });
    expect(e.apply(0, { type: 'SUBMIT_QUOTE', bid: 40, ask: 40, confirm: false }, 1)).toMatchObject({ ok: false });
    const r = e.apply(0, { type: 'SUBMIT_QUOTE', bid: 36, ask: 90, confirm: false }, 1);
    expect(r.ok).toBe(false);
    expect((r as any).error).toContain('range');
    ok(e.apply(0, { type: 'SUBMIT_QUOTE', bid: -15, ask: 84, confirm: false }, 1));
    const poor = makeEngine(DECK_39, { config: { startingCredits: 50 } });
    const r2 = poor.apply(0, { type: 'SUBMIT_QUOTE', bid: 84, confirm: false }, 1);
    expect(r2.ok).toBe(false);
    expect((r2 as any).error).toContain('not affordable');
    ok(poor.apply(0, { type: 'SUBMIT_QUOTE', bid: 30, confirm: false }, 1)); // risks 45 <= 50
  });

  it('keeps submissions sealed until everyone confirms, then publishes together', () => {
    const e = makeEngine();
    ok(e.apply(0, { type: 'SUBMIT_QUOTE', bid: 30, ask: 40, confirm: false }, 1));
    ok(e.apply(0, { type: 'SUBMIT_QUOTE', bid: 31, ask: 41, confirm: true }, 1));
    expect(e.apply(0, { type: 'SUBMIT_QUOTE', bid: 32, confirm: true }, 1).ok).toBe(false); // locked
    const v1 = projectView(e.state, 1, 1);
    expect(v1.seats[0].quote).toEqual({});
    expect(v1.seats[0].submissionConfirmed).toBe(true);
    expect(JSON.stringify(v1)).not.toContain('"bid":31');
    ok(e.apply(1, { type: 'SUBMIT_QUOTE', ask: 50, confirm: true }, 1));
    ok(e.apply(2, { type: 'SUBMIT_QUOTE', confirm: true }, 1));
    expect(e.phase).toBe('QUOTE_PREPARATION');
    ok(e.apply(3, { type: 'SUBMIT_QUOTE', confirm: true }, 1));
    expect(e.phase).toBe('TRADING');
    expect(e.state.seats[0].quote).toEqual({ bid: 31, ask: 41 });
    expect(e.state.seats[1].quote).toEqual({ ask: 50 });
    expect(e.state.turnSeat).toBe(0);
  });

  it('timeout publishes only confirmed quotes', () => {
    const e = makeEngine();
    ok(e.apply(0, { type: 'SUBMIT_QUOTE', bid: 30, confirm: true }, 1));
    ok(e.apply(1, { type: 'SUBMIT_QUOTE', bid: 20, ask: 60, confirm: false }, 1)); // never confirmed
    expect(e.tick(19_999)).toBe(false);
    expect(e.tick(20_000)).toBe(true);
    expect(e.phase).toBe('TRADING');
    expect(e.state.seats[0].quote).toEqual({ bid: 30 });
    expect(e.state.seats[1].quote).toEqual({});
  });
});

describe('trading and settlement', () => {
  it('reference trade: V=39, A +4, B -7, C +3, D 0 and total stays 400', () => {
    const e = makeEngine();
    confirmAll(e, { 1: { ask: 32 }, 2: { bid: 36 } });
    ok(e.apply(0, { type: 'BUY', target: 1, price: 32 }, 2));
    expect(e.state.seats[1].quote).toEqual({});
    ok(e.apply(1, { type: 'PASS' }, 2));
    ok(e.apply(2, { type: 'PASS' }, 2));
    ok(e.apply(3, { type: 'PASS' }, 2));
    // cycle 2 (first seat rotated to 1)
    expect(e.state.cycle).toBe(2);
    expect(e.publicCards()).toEqual([1]);
    confirmAll(e, { 2: { bid: 36 } });
    expect(e.state.turnSeat).toBe(1);
    ok(e.apply(1, { type: 'PASS' }, 3));
    ok(e.apply(2, { type: 'PASS' }, 3));
    ok(e.apply(3, { type: 'PASS' }, 3));
    ok(e.apply(0, { type: 'SELL', target: 2, price: 36 }, 3));
    expect(e.state.cycle).toBe(3);
    expect(e.publicCards()).toEqual([1, 2]);
    confirmAll(e, {});
    for (const s of [2, 3, 0, 1]) ok(e.apply(s, { type: 'PASS' }, 4));
    expect(e.phase).toBe('ROUND_REVIEW');
    const r = e.state.roundHistory[0];
    expect(r.settlementValue).toBe(39);
    expect(r.seats.map((s) => s.pnl)).toEqual([4, -7, 3, 0]);
    expect(e.state.seats.map((s) => s.balance)).toEqual([104, 93, 103, 100]);
    expect(e.state.seats.reduce((a, s) => a + s.balance, 0)).toBe(400);
    expect(e.state.roundHistory).toHaveLength(1);
    // FIFO breakdown for A
    const bd = pairTradesFifo(r.seats[0].trades, 39);
    expect(bd.pairs).toHaveLength(1);
    expect(bd.realized).toBe(4);
    expect(bd.settled).toBe(0);
    expect(bd.open).toHaveLength(0);
  });

  it('settles exactly once and clears positions', () => {
    const e = makeEngine();
    confirmAll(e, { 1: { ask: 32 } });
    ok(e.apply(0, { type: 'BUY', target: 1, price: 32 }, 2));
    for (const s of [1, 2, 3]) ok(e.apply(s, { type: 'PASS' }, 2));
    confirmAll(e, {});
    for (const s of [1, 2, 3, 0]) ok(e.apply(s, { type: 'PASS' }, 3));
    confirmAll(e, {});
    for (const s of [2, 3, 0, 1]) ok(e.apply(s, { type: 'PASS' }, 4));
    expect(e.phase).toBe('ROUND_REVIEW');
    expect(e.state.seats[0].balance).toBe(107);
    expect(e.state.seats[1].balance).toBe(93);
    expect(e.state.events.filter((x) => x.event.type === 'SETTLED')).toHaveLength(1);
    // ready up -> next round deals fresh, positions cleared
    for (let s = 0; s < 4; s++) ok(e.apply(s, { type: 'READY' }, 5));
    expect(e.state.round).toBe(2);
    expect(e.phase).toBe('QUOTE_PREPARATION');
    expect(e.state.seats.every((s) => s.position === 0 && s.cashflow === 0 && s.trades.length === 0)).toBe(true);
    expect(e.state.seats[0].roundStartBalance).toBe(107);
    expect(e.state.roundHistory).toHaveLength(1);
  });

  it('fills bid and ask sides independently and quotes have quantity one', () => {
    const e = makeEngine();
    confirmAll(e, { 1: { bid: 30, ask: 34 } });
    ok(e.apply(0, { type: 'BUY', target: 1, price: 34 }, 2));
    expect(e.state.seats[1].quote).toEqual({ bid: 30 });
    expect(e.apply(1, { type: 'BUY', target: 1, price: 34 }, 2).ok).toBe(false);
    ok(e.apply(1, { type: 'PASS' }, 2));
    ok(e.apply(2, { type: 'SELL', target: 1, price: 30 }, 2));
    expect(e.state.seats[1].quote).toEqual({});
    expect(e.state.seats[1].position).toBe(0);
    expect(e.state.seats[1].cashflow).toBe(4);
    // nothing left to take
    expect(e.apply(3, { type: 'SELL', target: 1, price: 30 }, 2).ok).toBe(false);
  });

  it('rejects stale prices, self trades and out-of-turn actions', () => {
    const e = makeEngine();
    confirmAll(e, { 0: { bid: 30, ask: 40 }, 1: { ask: 35 } });
    expect(e.apply(0, { type: 'BUY', target: 0, price: 40 }, 2)).toMatchObject({ ok: false, error: expect.stringContaining('yourself') });
    expect(e.apply(1, { type: 'BUY', target: 0, price: 40 }, 2)).toMatchObject({ ok: false, error: expect.stringContaining('not your turn') });
    expect(e.apply(0, { type: 'BUY', target: 1, price: 34 }, 2).ok).toBe(false);
    expect(e.apply(0, { type: 'READY' }, 2).ok).toBe(false);
    ok(e.apply(0, { type: 'BUY', target: 1, price: 35 }, 2));
  });

  it('enforces the ±2 position limit for executions', () => {
    const e = makeEngine();
    confirmAll(e, { 1: { ask: 20 }, 2: { ask: 20 }, 3: { ask: 20 } });
    ok(e.apply(0, { type: 'BUY', target: 1, price: 20 }, 2));
    for (const s of [1, 2, 3]) ok(e.apply(s, { type: 'PASS' }, 2));
    confirmAll(e, { 2: { ask: 20 }, 3: { ask: 20 } });
    for (const s of [1, 2, 3]) ok(e.apply(s, { type: 'PASS' }, 3));
    ok(e.apply(0, { type: 'BUY', target: 2, price: 20 }, 3));
    expect(e.state.seats[0].position).toBe(2);
    confirmAll(e, { 3: { ask: 20 } });
    for (const s of [2, 3]) ok(e.apply(s, { type: 'PASS' }, 4));
    const r = e.apply(0, { type: 'BUY', target: 3, price: 20 }, 4);
    expect(r.ok).toBe(false);
    expect((r as any).error).toContain('position');
  });

  it('negative trade prices settle correctly', () => {
    // Deal: private -20, -10, 1, 2; community 3, 4, 5 -> V = -15
    const e = makeEngine([-20, -10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    confirmAll(e, { 1: { bid: -5 } });
    ok(e.apply(0, { type: 'SELL', target: 1, price: -5 }, 2)); // A short at -5
    for (const s of [1, 2, 3]) ok(e.apply(s, { type: 'PASS' }, 2));
    confirmAll(e, {});
    for (const s of [1, 2, 3, 0]) ok(e.apply(s, { type: 'PASS' }, 3));
    confirmAll(e, {});
    for (const s of [2, 3, 0, 1]) ok(e.apply(s, { type: 'PASS' }, 4));
    const r = e.state.roundHistory[0];
    expect(r.settlementValue).toBe(-15);
    expect(r.seats[0].pnl).toBe(10); // sold at -5, value -15 -> +10
    expect(r.seats[1].pnl).toBe(-10);
    expect(e.state.seats.reduce((a, s) => a + s.balance, 0)).toBe(400);
  });

  it('automatically cancels quote sides that become unsafe after a trade, without rejecting the trade', () => {
    const e = makeEngine();
    confirmAll(e, { 0: { bid: 35, ask: 60 }, 1: { ask: 36 } });
    ok(e.apply(0, { type: 'BUY', target: 1, price: 36 }, 2));
    expect(e.state.seats[0].position).toBe(1);
    expect(e.state.seats[0].quote).toEqual({ ask: 60 }); // bid 35 would risk 101 > 100
    const cancels = e.state.events.filter((x) => x.event.type === 'QUOTE_CANCELLED');
    expect(cancels).toHaveLength(1);
    expect((cancels[0].event as any).cancellation).toMatchObject({ side: 'bid', price: 35 });
  });
});

describe('counter-offers', () => {
  function setup() {
    const e = makeEngine();
    confirmAll(e, { 1: { ask: 40, bid: 20 } });
    return e;
  }

  it('validates direction and executes on acceptance, consuming the quote side', () => {
    const e = setup();
    expect(e.apply(0, { type: 'COUNTER', target: 1, side: 'ask', price: 40 }, 2).ok).toBe(false);
    expect(e.apply(0, { type: 'COUNTER', target: 1, side: 'bid', price: 19 }, 2).ok).toBe(false);
    expect(e.apply(0, { type: 'COUNTER', target: 0, side: 'bid', price: 19 }, 2).ok).toBe(false);
    ok(e.apply(0, { type: 'COUNTER', target: 1, side: 'ask', price: 37 }, 2));
    const pc = e.state.pendingCounter!;
    expect(pc).toMatchObject({ from: 0, target: 1, side: 'ask', price: 37 });
    expect(e.state.deadline).toBe(2 + 10_000);
    // turn progression paused
    expect(e.apply(1, { type: 'PASS' }, 3).ok).toBe(false);
    expect(e.apply(2, { type: 'RESPOND_COUNTER', counterId: pc.id, accept: true }, 3).ok).toBe(false);
    ok(e.apply(1, { type: 'RESPOND_COUNTER', counterId: pc.id, accept: true }, 3));
    expect(e.state.seats[0].position).toBe(1);
    expect(e.state.seats[0].cashflow).toBe(-37);
    expect(e.state.seats[1].quote).toEqual({ bid: 20 });
    expect(e.state.pendingCounter).toBeNull();
    expect(e.state.turnSeat).toBe(1); // responder keeps their own turn
    ok(e.apply(1, { type: 'PASS' }, 4));
  });

  it('decline leaves the quote unchanged and consumes the initiator action', () => {
    const e = setup();
    ok(e.apply(0, { type: 'COUNTER', target: 1, side: 'bid', price: 25 }, 2));
    ok(e.apply(1, { type: 'RESPOND_COUNTER', counterId: e.state.pendingCounter!.id, accept: false }, 3));
    expect(e.state.seats[1].quote).toEqual({ ask: 40, bid: 20 });
    expect(e.state.turnSeat).toBe(1);
    expect(e.state.seats[0].hasActedThisCycle).toBe(true);
  });

  it('timeout declines', () => {
    const e = setup();
    ok(e.apply(0, { type: 'COUNTER', target: 1, side: 'ask', price: 30 }, 2));
    expect(e.tick(10_001)).toBe(false);
    expect(e.tick(10_002)).toBe(true);
    expect(e.state.pendingCounter).toBeNull();
    expect(e.state.seats[1].quote).toEqual({ ask: 40, bid: 20 });
    expect(e.state.turnSeat).toBe(1);
    const declined = e.state.events.find((x) => x.event.type === 'COUNTER_DECLINED');
    expect((declined!.event as any).reason).toBe('timeout');
  });

  it('rejects counters that would breach risk for either side', () => {
    const e = makeEngine();
    confirmAll(e, { 1: { ask: 40 } });
    // A countering at 84 is pointless but also fails the strictly-lower rule; try a bid counter with impossible risk
    expect(e.apply(0, { type: 'COUNTER', target: 1, side: 'ask', price: -16 }, 2).ok).toBe(false);
  });
});

describe('phase machine, expiry and rotation', () => {
  it('expires quotes before revealing the community card and rotates the first seat each cycle across rounds', () => {
    const e = makeEngine();
    const starts: number[] = [];
    for (let round = 1; round <= 2; round++) {
      for (let cycle = 1; cycle <= 3; cycle++) {
        expect(e.state.round).toBe(round);
        expect(e.state.cycle).toBe(cycle);
        expect(e.state.revealedCount).toBe(cycle - 1);
        starts.push(e.state.cycleStartSeat);
        confirmAll(e, { [(e.state.cycleStartSeat + 1) % 4]: { bid: 10, ask: 50 } });
        const order: number[] = [];
        while (e.phase === 'TRADING') {
          order.push(e.state.turnSeat!);
          ok(e.apply(e.state.turnSeat!, { type: 'PASS' }, 5));
        }
        expect(order).toEqual([0, 1, 2, 3].map((k) => (starts[starts.length - 1] + k) % 4));
      }
      expect(e.phase).toBe('ROUND_REVIEW');
      for (let s = 0; s < 4; s++) ok(e.apply(s, { type: 'READY' }, 6));
    }
    expect(starts).toEqual([0, 1, 2, 3, 0, 1]);
    const ev = e.state.events.filter((x) => x.round === 1 && (x.event.type === 'QUOTES_EXPIRED' || x.event.type === 'COMMUNITY_REVEALED'));
    expect(ev.map((x) => x.event.type)).toEqual(['QUOTES_EXPIRED', 'COMMUNITY_REVEALED', 'QUOTES_EXPIRED', 'COMMUNITY_REVEALED', 'QUOTES_EXPIRED', 'COMMUNITY_REVEALED']);
    // quotes gone as soon as cycle ends
    expect(e.state.seats.every((s) => Object.keys(s.quote).length === 0)).toBe(true);
  });

  it('turn timeout passes, review timeout advances, and a match completes with winners', () => {
    const e = makeEngine(DECK_39, { config: { rounds: 1 } });
    confirmAll(e, { 1: { ask: 32 } });
    ok(e.apply(0, { type: 'BUY', target: 1, price: 32 }, 2));
    expect(e.tick(2 + 20_000)).toBe(true); // seat 1 times out
    expect(e.state.turnSeat).toBe(2);
    expect(e.state.events.at(-2)!.event).toMatchObject({ type: 'PASS', reason: 'timeout' });
    e.tick(100_000);
    e.tick(200_000);
    expect(e.phase).toBe('QUOTE_PREPARATION');
    e.tick(300_000); // prep timeout, nobody confirmed
    for (let i = 0; i < 4; i++) e.tick(1_000_000 + i * 30_000);
    expect(e.phase).toBe('QUOTE_PREPARATION');
    e.tick(2_000_000);
    for (let i = 0; i < 4; i++) e.tick(3_000_000 + i * 30_000);
    expect(e.phase).toBe('ROUND_REVIEW');
    expect(e.tick(3_000_000 + 3 * 30_000 + 29_999)).toBe(false);
    expect(e.tick(3_000_000 + 3 * 30_000 + 30_000)).toBe(true);
    expect(e.phase).toBe('MATCH_COMPLETE');
    expect(e.state.winners).toEqual([0]); // A +7
  });

  it('shares the win on equal balances', () => {
    const e = makeEngine(DECK_39, { config: { rounds: 1 } });
    for (let c = 0; c < 3; c++) {
      confirmAll(e, {});
      while (e.phase === 'TRADING') ok(e.apply(e.state.turnSeat!, { type: 'PASS' }, 5));
    }
    for (let s = 0; s < 4; s++) ok(e.apply(s, { type: 'READY' }, 6));
    expect(e.state.winners).toEqual([0, 1, 2, 3]);
  });
});

describe('views and information hiding', () => {
  it('hides other private cards, hidden community cards, unused cards and sealed submissions', () => {
    const e = makeEngine();
    ok(e.apply(1, { type: 'SUBMIT_QUOTE', bid: 30, ask: 40, confirm: true }, 1));
    const v = projectView(e.state, 0, 1);
    expect(v.seats[0].privateCard).toBe(10);
    expect(v.seats.slice(1).every((s) => s.privateCard === null)).toBe(true);
    expect(v.communityCards).toEqual([null, null, null]);
    expect(JSON.stringify(v)).not.toContain('unused');
    expect(v.seats[1].quote).toEqual({});
    expect(v.me!.submission).toBeDefined();
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/"bid":30/);
    expect(json).not.toMatch(/"ask":40/);
    const observer = projectView(e.state, null, 1);
    expect(observer.seats.every((s) => s.privateCard === null)).toBe(true);
    expect(observer.me).toBeNull();
  });

  it('reveals all cards only after settlement', () => {
    const e = makeEngine();
    for (let c = 0; c < 3; c++) {
      confirmAll(e, {});
      while (e.phase === 'TRADING') ok(e.apply(e.state.turnSeat!, { type: 'PASS' }, 5));
    }
    const v = projectView(e.state, 0, 1);
    expect(v.phase).toBe('ROUND_REVIEW');
    expect(v.seats.map((s) => s.privateCard)).toEqual([10, 9, 8, 6]);
    expect(v.communityCards).toEqual([1, 2, 3]);
    expect(v.lastRound!.settlementValue).toBe(39);
  });

  it('reports reserved risk and available credits for the local player', () => {
    const e = makeEngine();
    ok(e.apply(0, { type: 'SUBMIT_QUOTE', bid: 36, confirm: false }, 1));
    const v = projectView(e.state, 0, 1);
    expect(v.me!.reserved).toBe(51);
    expect(v.me!.available).toBe(49);
  });

  it('bot observation is structurally restricted', () => {
    const e = makeEngine();
    ok(e.apply(1, { type: 'SUBMIT_QUOTE', bid: 30, ask: 40, confirm: true }, 1));
    const obs = buildBotObservation(e.state, 0);
    expect(Object.keys(obs).sort()).toEqual(
      ['bounds', 'cycle', 'cyclesPerRound', 'myQuote', 'opponents', 'ownCard', 'pendingCounterForMe', 'phase', 'portfolio', 'positionLimit', 'publicCards', 'publishedQuotes', 'round', 'seat', 'tradesThisRound'].sort(),
    );
    expect(obs.ownCard).toBe(10);
    const json = JSON.stringify(obs);
    expect(json).not.toContain('privateCard');
    expect(json).not.toContain('unused');
    expect(json).not.toContain('submission');
    expect(obs.opponents.every((o) => Object.keys(o.quote).length === 0)).toBe(true);
    expect(obs.publicCards).toEqual([]);
  });
});

describe('bots', () => {
  it('computes the conditional expected total', () => {
    // own 15, no public: 15 + 6 * (75/16)
    expect(expectedTotal(15, [])).toBeCloseTo(15 + 6 * (75 / 16), 10);
    expect(expectedTotal(-20, [15, 14])).toBeCloseTo(9 + 4 * ((90 - 9) / 14), 10);
  });

  it('seeded all-AI matches obey every invariant and trade meaningfully', () => {
    let totalTrades = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { engine } = simulateMatch(seed, ['easy', 'normal', 'hard', seed % 2 ? 'normal' : 'hard']);
      const st = engine.state;
      expect(st.phase).toBe('MATCH_COMPLETE');
      expect(st.roundHistory).toHaveLength(10);
      expect(st.seats.reduce((a, s) => a + s.balance, 0)).toBe(400);
      for (const r of st.roundHistory) {
        expect(r.seats.reduce((a, s) => a + s.endBalance, 0)).toBe(400);
        expect(r.seats.reduce((a, s) => a + s.position, 0)).toBe(0);
        expect(r.seats.reduce((a, s) => a + s.cashflow, 0)).toBe(0);
        for (const s of r.seats) {
          expect(s.endBalance).toBeGreaterThanOrEqual(0);
          expect(Math.abs(s.position)).toBeLessThanOrEqual(2);
        }
        expect(new Set([...r.privateCards, ...r.communityCards]).size).toBe(7);
      }
      const trades = st.events.filter((x) => x.event.type === 'TRADE').map((x) => (x.event as any).trade);
      for (const t of trades) {
        expect(t.buyer).not.toBe(t.seller);
        expect(t.price).toBeGreaterThanOrEqual(-15);
        expect(t.price).toBeLessThanOrEqual(84);
      }
      // every execution recorded for both counterparties
      for (const r of st.roundHistory) {
        const ids = r.seats.flatMap((s) => s.trades.map((t) => `${t.tradeId}:${t.side}`));
        const buys = ids.filter((x) => x.endsWith('BUY')).length;
        const sells = ids.filter((x) => x.endsWith('SELL')).length;
        expect(buys).toBe(sells);
      }
      totalTrades += trades.length;
    }
    expect(totalTrades / 150).toBeGreaterThan(8); // at least a trade per round on average
  });
});
