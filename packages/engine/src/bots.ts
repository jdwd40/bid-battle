import { DEALT_CARD_COUNT, type Difficulty } from './config.js';
import { randomInt, type Rng } from './random.js';
import { applyBuy, applySell, checkPortfolio, evaluateQuote, remainingDeck, validateQuotePrices, type QuoteSides } from './risk.js';
import type { Command } from './types.js';
import type { BotObservation } from './view.js';

/**
 * Conditional expected settlement total given the cards a trader can see:
 * sum(known) + unknownDealt * mean(deck excluding known).
 */
export function expectedTotal(ownCard: number, publicCards: readonly number[]): number {
  const known = [ownCard, ...publicCards];
  const rest = remainingDeck(known);
  const mean = rest.reduce((a, b) => a + b, 0) / rest.length;
  return known.reduce((a, b) => a + b, 0) + (DEALT_CARD_COUNT - known.length) * mean;
}

export interface Bot {
  readonly difficulty: Difficulty;
  decideQuote(obs: BotObservation, rng: Rng): QuoteSides;
  decideTurn(obs: BotObservation, rng: Rng): Command;
  decideCounter(obs: BotObservation, rng: Rng): boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Shrink a desired quote until it is legal and affordable; may return an empty quote. */
export function fitQuote(obs: BotObservation, desired: QuoteSides): QuoteSides {
  const { bounds, portfolio, positionLimit } = obs;
  const q: QuoteSides = {};
  if (desired.bid !== undefined) q.bid = clamp(Math.round(desired.bid), bounds.L, bounds.U);
  if (desired.ask !== undefined) q.ask = clamp(Math.round(desired.ask), bounds.L, bounds.U);
  if (q.bid !== undefined && q.ask !== undefined && q.bid >= q.ask) {
    if (q.ask < bounds.U) q.ask = q.bid + 1;
    else q.bid = q.ask - 1;
  }
  const legal = (x: QuoteSides) => validateQuotePrices(x, bounds) === null && evaluateQuote(portfolio, x, bounds, positionLimit).ok;
  if (legal(q)) return q;
  // Drop the side that adds exposure in the direction we already lean.
  const order: Array<'bid' | 'ask'> = portfolio.q >= 0 ? ['bid', 'ask'] : ['ask', 'bid'];
  for (const drop of order) {
    const alt: QuoteSides = { ...q };
    delete alt[drop];
    if ((alt.bid !== undefined || alt.ask !== undefined) && legal(alt)) return alt;
  }
  return {};
}

interface BestLevels {
  bestAsk: { seat: number; price: number } | null;
  bestBid: { seat: number; price: number } | null;
}

function bestLevels(obs: BotObservation): BestLevels {
  let bestAsk: BestLevels['bestAsk'] = null;
  let bestBid: BestLevels['bestBid'] = null;
  for (const o of obs.opponents) {
    if (o.quote.ask !== undefined && (!bestAsk || o.quote.ask < bestAsk.price)) bestAsk = { seat: o.seat, price: o.quote.ask };
    if (o.quote.bid !== undefined && (!bestBid || o.quote.bid > bestBid.price)) bestBid = { seat: o.seat, price: o.quote.bid };
  }
  return { bestAsk, bestBid };
}

function canBuy(obs: BotObservation, price: number): boolean {
  return checkPortfolio(applyBuy(obs.portfolio, price), obs.bounds, obs.positionLimit).ok;
}
function canSell(obs: BotObservation, price: number): boolean {
  return checkPortfolio(applySell(obs.portfolio, price), obs.bounds, obs.positionLimit).ok;
}

/** Market signal from public quotes and trades this round (used by Hard). */
function marketSignal(obs: BotObservation): number | null {
  const samples: number[] = [];
  for (const q of obs.publishedQuotes) {
    if (q.seat === obs.seat) continue;
    if (q.bid !== undefined && q.ask !== undefined) samples.push((q.bid + q.ask) / 2);
  }
  for (const t of obs.tradesThisRound) {
    if (t.buyer !== obs.seat && t.seller !== obs.seat) samples.push(t.price);
  }
  if (!samples.length) return null;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

interface Profile {
  difficulty: Difficulty;
  estimate(obs: BotObservation, rng: Rng): number;
  halfSpread(rng: Rng): number;
  skewPerUnit: number;
  /** Extra edge required to trade into a larger position. */
  edge(obs: BotObservation, direction: 1 | -1): number;
  counters: boolean;
  counterEdge: number;
  acceptEdge: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: {
    difficulty: 'easy',
    estimate: (obs, rng) => expectedTotal(obs.ownCard, obs.publicCards) + randomInt(rng, -6, 6),
    halfSpread: (rng) => randomInt(rng, 5, 8),
    skewPerUnit: 1,
    edge: () => 2,
    counters: false,
    counterEdge: 0,
    acceptEdge: 0,
  },
  normal: {
    difficulty: 'normal',
    estimate: (obs) => expectedTotal(obs.ownCard, obs.publicCards),
    halfSpread: (rng) => randomInt(rng, 3, 4),
    skewPerUnit: 1.5,
    edge: (obs, dir) => (Math.sign(obs.portfolio.q) === dir && obs.portfolio.q !== 0 ? 3 : 1),
    counters: true,
    counterEdge: 1,
    acceptEdge: 1,
  },
  hard: {
    difficulty: 'hard',
    estimate: (obs) => {
      const ev = expectedTotal(obs.ownCard, obs.publicCards);
      const signal = marketSignal(obs);
      if (signal === null) return ev;
      // Cautious inference: lean toward the market but never move more than 5 points.
      return ev + clamp(0.35 * (signal - ev), -5, 5);
    },
    halfSpread: (rng) => randomInt(rng, 2, 3),
    skewPerUnit: 2,
    edge: (obs, dir) => (Math.sign(obs.portfolio.q) === dir && obs.portfolio.q !== 0 ? 4 : 1),
    counters: true,
    counterEdge: 2,
    acceptEdge: 2,
  },
};

class ProfileBot implements Bot {
  readonly difficulty: Difficulty;
  constructor(private readonly p: Profile) {
    this.difficulty = p.difficulty;
  }

  decideQuote(obs: BotObservation, rng: Rng): QuoteSides {
    const est = this.p.estimate(obs, rng);
    const mid = est - this.p.skewPerUnit * obs.portfolio.q;
    const hs = this.p.halfSpread(rng);
    const desired: QuoteSides = {};
    if (obs.portfolio.q < obs.positionLimit) desired.bid = Math.floor(mid - hs);
    if (obs.portfolio.q > -obs.positionLimit) desired.ask = Math.ceil(mid + hs);
    return fitQuote(obs, desired);
  }

  decideTurn(obs: BotObservation, rng: Rng): Command {
    const est = this.p.estimate(obs, rng);
    const { bestAsk, bestBid } = bestLevels(obs);
    const buyEdge = this.p.edge(obs, 1);
    const sellEdge = this.p.edge(obs, -1);
    const buyValue = bestAsk ? est - bestAsk.price : -Infinity;
    const sellValue = bestBid ? bestBid.price - est : -Infinity;
    if (bestAsk && buyValue >= buyEdge && buyValue >= sellValue && canBuy(obs, bestAsk.price)) {
      return { type: 'BUY', target: bestAsk.seat, price: bestAsk.price };
    }
    if (bestBid && sellValue >= sellEdge && canSell(obs, bestBid.price)) {
      return { type: 'SELL', target: bestBid.seat, price: bestBid.price };
    }
    if (this.p.counters) {
      // Counter when a quote is close to fair but not quite there.
      if (bestAsk && bestAsk.price - est <= 5 && bestAsk.price - est > -buyEdge) {
        const price = Math.floor(est - this.p.counterEdge);
        if (price < bestAsk.price && price >= obs.bounds.L && canBuy(obs, price)) {
          return { type: 'COUNTER', target: bestAsk.seat, side: 'ask', price };
        }
      }
      if (bestBid && est - bestBid.price <= 5 && est - bestBid.price > -sellEdge) {
        const price = Math.ceil(est + this.p.counterEdge);
        if (price > bestBid.price && price <= obs.bounds.U && canSell(obs, price)) {
          return { type: 'COUNTER', target: bestBid.seat, side: 'bid', price };
        }
      }
    }
    return { type: 'PASS' };
  }

  decideCounter(obs: BotObservation, rng: Rng): boolean {
    const pc = obs.pendingCounterForMe;
    if (!pc) return false;
    const est = this.p.estimate(obs, rng);
    if (pc.side === 'ask') {
      // Someone wants to buy from me at pc.price: I would sell.
      return pc.price - est >= this.p.acceptEdge && canSell(obs, pc.price);
    }
    return est - pc.price >= this.p.acceptEdge && canBuy(obs, pc.price);
  }
}

export function createBot(difficulty: Difficulty): Bot {
  return new ProfileBot(PROFILES[difficulty]);
}
