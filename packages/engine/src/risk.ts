import { FULL_DECK, DEALT_CARD_COUNT } from './config.js';

/** Portfolio for one trader within a round. */
export interface Portfolio {
  /** Balance at the start of the round. */
  B: number;
  /** Net position: contracts bought minus contracts sold. */
  q: number;
  /** Cashflow offset: sum of sale prices minus sum of purchase prices. */
  C: number;
}

export interface Bounds {
  L: number;
  U: number;
}

export interface QuoteSides {
  bid?: number;
  ask?: number;
}

/** Remove one occurrence of each `cards` element from the full deck. */
export function remainingDeck(removed: readonly number[]): number[] {
  const deck = FULL_DECK.slice();
  for (const c of removed) {
    const i = deck.indexOf(c);
    if (i >= 0) deck.splice(i, 1);
  }
  return deck;
}

/**
 * Publicly possible settlement range given the public community cards.
 * Uses ONLY public information so it never leaks a private card.
 */
export function publicBounds(publicCards: readonly number[]): Bounds {
  const rest = remainingDeck(publicCards).sort((a, b) => a - b);
  const m = DEALT_CARD_COUNT - publicCards.length;
  const base = publicCards.reduce((s, c) => s + c, 0);
  const L = base + rest.slice(0, m).reduce((s, c) => s + c, 0);
  const U = base + rest.slice(rest.length - m).reduce((s, c) => s + c, 0);
  return { L, U };
}

/** Round P&L for a settlement value V. */
export function pnlAt(p: Pick<Portfolio, 'q' | 'C'>, V: number): number {
  return p.C + p.q * V;
}

/** Worst possible loss over the public range (never negative). */
export function worstLoss(p: Pick<Portfolio, 'q' | 'C'>, bounds: Bounds): number {
  return Math.max(0, -Math.min(pnlAt(p, bounds.L), pnlAt(p, bounds.U)));
}

export function applyBuy(p: Portfolio, price: number): Portfolio {
  return { B: p.B, q: p.q + 1, C: p.C - price };
}

export function applySell(p: Portfolio, price: number): Portfolio {
  return { B: p.B, q: p.q - 1, C: p.C + price };
}

export interface PortfolioCheck {
  ok: boolean;
  reason?: string;
  worstLoss: number;
}

/** Validate a single executed portfolio against position and credit limits. */
export function checkPortfolio(p: Portfolio, bounds: Bounds, positionLimit: number): PortfolioCheck {
  const wl = worstLoss(p, bounds);
  if (Math.abs(p.q) > positionLimit) {
    return { ok: false, reason: `position ${p.q} exceeds limit of ±${positionLimit}`, worstLoss: wl };
  }
  if (wl > p.B) {
    return { ok: false, reason: `worst-case loss ${wl} exceeds balance ${p.B}`, worstLoss: wl };
  }
  return { ok: true, worstLoss: wl };
}

/** Every fill subset of a quote (including no fills). */
export function fillSubsets(quote: QuoteSides): Array<{ fills: Array<'bid' | 'ask'>; portfolioOf: (p: Portfolio) => Portfolio }> {
  const sides: Array<'bid' | 'ask'> = [];
  if (quote.bid !== undefined) sides.push('bid');
  if (quote.ask !== undefined) sides.push('ask');
  const subsets: Array<Array<'bid' | 'ask'>> = [[]];
  for (const s of sides) subsets.push(...subsets.map((sub) => [...sub, s]));
  return subsets.map((fills) => ({
    fills,
    portfolioOf: (p: Portfolio) => {
      let out = p;
      for (const f of fills) out = f === 'bid' ? applyBuy(out, quote.bid!) : applySell(out, quote.ask!);
      return out;
    },
  }));
}

export interface QuoteEvaluation {
  ok: boolean;
  reason?: string;
  /** Maximum worst-case loss over every possible fill subset. */
  reserved: number;
  /** The fill subset that produced the reserved amount (for explanations). */
  worstSubset: Array<'bid' | 'ask'>;
}

/**
 * Evaluate whether a quote is affordable for the given portfolio:
 * every fill subset must respect the position limit and worstLoss <= B.
 * Price-range validation is handled separately (see validateQuotePrices).
 */
export function evaluateQuote(p: Portfolio, quote: QuoteSides, bounds: Bounds, positionLimit: number): QuoteEvaluation {
  let reserved = 0;
  let worstSubset: Array<'bid' | 'ask'> = [];
  for (const sub of fillSubsets(quote)) {
    const after = sub.portfolioOf(p);
    const check = checkPortfolio(after, bounds, positionLimit);
    if (!check.ok) {
      const label = sub.fills.length === 0 ? 'with no fills' : `if ${sub.fills.join(' and ')} filled`;
      return { ok: false, reason: `${label}: ${check.reason}`, reserved: check.worstLoss, worstSubset: sub.fills };
    }
    if (check.worstLoss > reserved) {
      reserved = check.worstLoss;
      worstSubset = sub.fills;
    }
  }
  return { ok: true, reserved, worstSubset };
}

/** Static price validation for quote sides. */
export function validateQuotePrices(quote: QuoteSides, bounds: Bounds): string | null {
  for (const side of ['bid', 'ask'] as const) {
    const v = quote[side];
    if (v === undefined) continue;
    if (!Number.isInteger(v)) return `${side} must be a whole number`;
    if (v < bounds.L || v > bounds.U) return `${side} ${v} is outside the possible range ${bounds.L} to ${bounds.U}`;
  }
  if (quote.bid !== undefined && quote.ask !== undefined && quote.bid >= quote.ask) {
    return `bid (${quote.bid}) must be strictly below ask (${quote.ask})`;
  }
  return null;
}

export interface Cancellation {
  side: 'bid' | 'ask';
  price: number;
  reason: string;
}

/**
 * Deterministically trim a quote until every fill subset is valid for the portfolio.
 * Cancels the side that adds exposure in the direction of the current position first;
 * when flat, cancels the side with the larger stand-alone worst-case loss (ask on ties).
 */
export function trimQuote(p: Portfolio, quote: QuoteSides, bounds: Bounds, positionLimit: number): { quote: QuoteSides; cancellations: Cancellation[] } {
  const q: QuoteSides = { ...quote };
  const cancellations: Cancellation[] = [];
  for (let guard = 0; guard < 3; guard++) {
    const ev = evaluateQuote(p, q, bounds, positionLimit);
    if (ev.ok) break;
    const has = (s: 'bid' | 'ask') => q[s] !== undefined;
    let victim: 'bid' | 'ask';
    if (has('bid') && !has('ask')) victim = 'bid';
    else if (has('ask') && !has('bid')) victim = 'ask';
    else if (p.q > 0) victim = 'bid';
    else if (p.q < 0) victim = 'ask';
    else {
      const bidLoss = worstLoss(applyBuy(p, q.bid!), bounds);
      const askLoss = worstLoss(applySell(p, q.ask!), bounds);
      victim = bidLoss > askLoss ? 'bid' : 'ask';
    }
    cancellations.push({ side: victim, price: q[victim]!, reason: ev.reason ?? 'risk limit' });
    delete q[victim];
  }
  return { quote: q, cancellations };
}
