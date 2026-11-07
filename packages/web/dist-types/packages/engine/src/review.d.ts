import type { SeatTradeRecord } from './types.js';
export interface PairedTrade {
    open: SeatTradeRecord;
    close: SeatTradeRecord;
    /** Locked profit regardless of settlement value. */
    profit: number;
}
export interface TradeBreakdown {
    pairs: PairedTrade[];
    /** Unmatched trades that settled against the final value. */
    open: SeatTradeRecord[];
    realized: number;
    settled: number;
    total: number;
}
/**
 * FIFO pairing convention for the educational review: each trade is matched with
 * the earliest unmatched trade on the opposite side. Settlement itself does NOT
 * use this; it uses the exact aggregate formula C + q*V.
 */
export declare function pairTradesFifo(trades: SeatTradeRecord[], settlementValue: number): TradeBreakdown;
//# sourceMappingURL=review.d.ts.map