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
export declare function remainingDeck(removed: readonly number[]): number[];
/**
 * Publicly possible settlement range given the public community cards.
 * Uses ONLY public information so it never leaks a private card.
 */
export declare function publicBounds(publicCards: readonly number[]): Bounds;
/** Round P&L for a settlement value V. */
export declare function pnlAt(p: Pick<Portfolio, 'q' | 'C'>, V: number): number;
/** Worst possible loss over the public range (never negative). */
export declare function worstLoss(p: Pick<Portfolio, 'q' | 'C'>, bounds: Bounds): number;
export declare function applyBuy(p: Portfolio, price: number): Portfolio;
export declare function applySell(p: Portfolio, price: number): Portfolio;
export interface PortfolioCheck {
    ok: boolean;
    reason?: string;
    worstLoss: number;
}
/** Validate a single executed portfolio against position and credit limits. */
export declare function checkPortfolio(p: Portfolio, bounds: Bounds, positionLimit: number): PortfolioCheck;
/** Every fill subset of a quote (including no fills). */
export declare function fillSubsets(quote: QuoteSides): Array<{
    fills: Array<'bid' | 'ask'>;
    portfolioOf: (p: Portfolio) => Portfolio;
}>;
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
export declare function evaluateQuote(p: Portfolio, quote: QuoteSides, bounds: Bounds, positionLimit: number): QuoteEvaluation;
/** Static price validation for quote sides. */
export declare function validateQuotePrices(quote: QuoteSides, bounds: Bounds): string | null;
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
export declare function trimQuote(p: Portfolio, quote: QuoteSides, bounds: Bounds, positionLimit: number): {
    quote: QuoteSides;
    cancellations: Cancellation[];
};
//# sourceMappingURL=risk.d.ts.map