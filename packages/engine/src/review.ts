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
export function pairTradesFifo(trades: SeatTradeRecord[], settlementValue: number): TradeBreakdown {
  const openBuys: SeatTradeRecord[] = [];
  const openSells: SeatTradeRecord[] = [];
  const pairs: PairedTrade[] = [];
  for (const t of trades) {
    const opposite = t.side === 'BUY' ? openSells : openBuys;
    const same = t.side === 'BUY' ? openBuys : openSells;
    if (opposite.length) {
      const o = opposite.shift()!;
      const buy = t.side === 'BUY' ? t : o;
      const sell = t.side === 'SELL' ? t : o;
      pairs.push({ open: o, close: t, profit: sell.price - buy.price });
    } else {
      same.push(t);
    }
  }
  const open = [...openBuys, ...openSells].sort((a, b) => a.tradeId - b.tradeId);
  const realized = pairs.reduce((s, p) => s + p.profit, 0);
  const settled = open.reduce((s, t) => s + (t.side === 'BUY' ? settlementValue - t.price : t.price - settlementValue), 0);
  return { pairs, open, realized, settled, total: realized + settled };
}
