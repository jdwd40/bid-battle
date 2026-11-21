import { describe, expect, it } from 'vitest';
import { evaluateQuote, publicRangeFor, validateQuotePrices, type PlayerView, type Portfolio, type SeatView } from '@bid-battle/engine';
import { suggestedQuote } from './coach';

/** A quote-preparation view for seat 0 holding `card`, with no community cards revealed. */
function viewFor(card: number, portfolio: Portfolio): PlayerView {
  const seat = (index: number): SeatView => ({
    index,
    name: `Trader ${index}`,
    isBot: index !== 0,
    difficulty: 'normal',
    balance: index === 0 ? portfolio.B : 100,
    position: index === 0 ? portfolio.q : 0,
    privateCard: index === 0 ? card : null,
    quote: {},
    sealedQuoteConfirmed: false,
    hasActedThisCycle: false,
    ready: true,
  });
  return {
    seat: 0,
    phase: 'QUOTE_PREPARATION',
    round: 1,
    totalRounds: 3,
    cycle: 1,
    cyclesPerRound: 3,
    positionLimit: 2,
    communityCards: [null, null, null],
    publicCards: [],
    publicRange: publicRangeFor([]),
    cycleStartSeat: 0,
    turnSeat: null,
    pendingCounter: null,
    deadline: null,
    serverNow: 0,
    version: 1,
    phaseVersion: 1,
    seats: [seat(0), seat(1), seat(2), seat(3)],
    me: { sealedQuote: null, portfolio, reserved: 0, available: portfolio.B, trades: [] },
    events: [],
    lastRound: null,
    balanceHistory: [],
    winners: null,
  };
}

describe('suggested quote', () => {
  // Holding an 8 with nothing revealed, the fair estimate is 38.75, so the usual
  // suggestion is 35 / 43. The public range is -15 to 84.

  it('straddles the fair estimate when the balance is comfortable', () => {
    expect(suggestedQuote(viewFor(8, { B: 100, q: 0, C: 0 }))).toEqual({ quote: { bid: 35, ask: 43 } });
  });

  it('moves the prices until the engine finds them affordable when the balance is tight', () => {
    // With 40 credits a bid can be at most 25 (25 - -15 = 40 at risk) and an ask at least 44 (84 - 44 = 40).
    const game = viewFor(8, { B: 40, q: 0, C: 0 });
    const suggestion = suggestedQuote(game);
    expect(suggestion).toEqual({ quote: { bid: 25, ask: 44 } });
    expect(validateQuotePrices(suggestion!.quote!, game.publicRange)).toBeNull();
    expect(evaluateQuote(game.me!.portfolio, suggestion!.quote!, game.publicRange, game.positionLimit).ok).toBe(true);
  });

  it('suggests posting no prices, with a reason, when no quote is affordable', () => {
    // Both sides off, so the form starts on "Confirm: no prices", which the game always accepts.
    const suggestion = suggestedQuote(viewFor(8, { B: 0, q: 0, C: 0 }));
    expect(suggestion?.quote).toEqual({});
    expect(suggestion?.reason).toMatch(/credits/);
  });

  it('keeps both sides, strictly inside the public range and affordable, whenever each side is affordable on its own', () => {
    const range = publicRangeFor([]);
    const strictlyInside = (p: number) => p > range.L && p < range.U;
    const alone = (game: PlayerView, side: 'bid' | 'ask') => {
      for (let p = range.L + 1; p < range.U; p++) if (evaluateQuote(game.me!.portfolio, { [side]: p }, range, game.positionLimit).ok) return true;
      return false;
    };
    let checked = 0;
    for (const card of [1, 8, 15])
      for (const q of [-2, -1, 0, 1, 2])
        for (const C of [-120, -60, -30, 0, 30, 60, 120])
          for (const B of [10, 40, 45, 60, 100, 200]) {
            const game = viewFor(card, { B, q, C });
            if (!evaluateQuote(game.me!.portfolio, {}, range, game.positionLimit).ok) continue;
            if (!alone(game, 'bid') || !alone(game, 'ask')) continue;
            const { quote, reason } = suggestedQuote(game)!;
            expect(reason, `card ${card}, ${JSON.stringify({ B, q, C })}`).toBeUndefined();
            expect(strictlyInside(quote.bid!) && strictlyInside(quote.ask!), `prices ${JSON.stringify(quote)}`).toBe(true);
            expect(evaluateQuote(game.me!.portfolio, quote, range, game.positionLimit).ok).toBe(true);
            checked++;
          }
    expect(checked, 'portfolios where each side fits alone').toBeGreaterThan(20);
  });

  it('says why the bid was left off when a bid would pass the position limit', () => {
    // Long two contracts (bought at 30 each): buying another would make the position 3.
    const suggestion = suggestedQuote(viewFor(8, { B: 100, q: 2, C: -60 }));
    expect(suggestion?.quote).toEqual({ ask: 43 });
    expect(suggestion?.reason).toMatch(/bid/i);
    expect(suggestion?.reason).toMatch(/position limit/);
  });

  it('says why the bid was left off when the credits cannot cover a bid', () => {
    // Long one bought at 30 with 45 credits: a settlement value of -15 already loses 45, so any bid adds loss beyond the balance.
    const suggestion = suggestedQuote(viewFor(8, { B: 45, q: 1, C: -30 }));
    expect(suggestion?.quote).toEqual({ ask: 43 });
    expect(suggestion?.reason).toMatch(/bid/i);
    expect(suggestion?.reason).toMatch(/credits/);
  });
});
