import type { GameEvent, LoggedEvent, Phase } from '@bid-battle/engine';
import type { PlayerView, SeatView } from '@bid-battle/engine';

/** Format a number using a true minus sign so negatives are unmistakable. */
export function fmt(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `${n}`;
}

/** Signed P&L formatting: +4 / −7 / 0. */
export function fmtSigned(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

export function fmtPosition(q: number): string {
  if (q === 0) return 'Flat';
  return q > 0 ? `Long ${q}` : `Short ${Math.abs(q)}`;
}

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'LOBBY':
      return 'Lobby';
    case 'DEAL':
      return 'Dealing';
    case 'QUOTE_PREPARATION':
      return 'Sealed quotes';
    case 'TRADING':
      return 'Trading';
    case 'SETTLEMENT':
      return 'Settlement';
    case 'ROUND_REVIEW':
      return 'Round review';
    case 'MATCH_COMPLETE':
      return 'Match complete';
  }
}

export function describeEvent(e: LoggedEvent, seats: SeatView[]): string | null {
  const name = (i: number) => seats[i]?.name ?? `Seat ${i + 1}`;
  const ev: GameEvent = e.event;
  switch (ev.type) {
    case 'MATCH_STARTED':
      return `Match started. ${name(ev.firstSeat)} opens the first trading cycle.`;
    case 'ROUND_STARTED':
      return `Round ${ev.round}: new deal.`;
    case 'CYCLE_STARTED':
      return `Cycle ${ev.cycle} — sealed quote preparation. ${name(ev.firstSeat)} will act first.`;
    case 'QUOTE_CONFIRMED':
      return `${name(ev.seat)} confirmed a sealed quote.`;
    case 'QUOTES_PUBLISHED': {
      const n = ev.quotes.filter((q) => q.bid !== undefined || q.ask !== undefined).length;
      return `Quotes revealed: ${n} trader${n === 1 ? '' : 's'} posted prices.`;
    }
    case 'QUOTES_EXPIRED':
      return `Cycle ${ev.cycle} ended — all quotes expired.`;
    case 'COMMUNITY_REVEALED':
      return `Community card ${ev.index + 1} revealed: ${fmt(ev.card)}.`;
    case 'TURN_STARTED':
      return null;
    case 'TRADE':
      return `${name(ev.trade.buyer)} bought 1 from ${name(ev.trade.seller)} at ${fmt(ev.trade.price)}${ev.trade.via === 'counter' ? ' (negotiated)' : ''}.`;
    case 'PASS':
      return `${name(ev.seat)} passed${ev.reason === 'timeout' ? ' (timed out)' : ''}.`;
    case 'COUNTER_PROPOSED': {
      const c = ev.counter;
      return c.side === 'ask'
        ? `${name(c.from)} offers to buy from ${name(c.target)} at ${fmt(c.price)} (ask was ${fmt(c.quotedPrice)}).`
        : `${name(c.from)} offers to sell to ${name(c.target)} at ${fmt(c.price)} (bid was ${fmt(c.quotedPrice)}).`;
    }
    case 'COUNTER_ACCEPTED':
      return 'Counter-offer accepted.';
    case 'COUNTER_DECLINED':
      return ev.reason === 'timeout' ? 'Counter-offer timed out — declined.' : 'Counter-offer declined.';
    case 'QUOTE_CANCELLED':
      return `${name(ev.seat)}'s ${ev.cancellation.side} at ${fmt(ev.cancellation.price)} was removed by risk cancellation (${ev.cancellation.reason}).`;
    case 'SETTLED':
      return `Round ${ev.result.round} settled at ${fmt(ev.result.settlementValue)}.`;
    case 'PLAYER_READY':
      return `${name(ev.seat)} is ready.`;
    case 'MATCH_COMPLETE':
      return `Match complete. Winner${ev.winners.length > 1 ? 's' : ''}: ${ev.winners.map(name).join(', ')}.`;
  }
}

export function difficultyLabel(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** Under a community card: when it will be revealed, or that it has been. */
export function revealLabel(game: Pick<PlayerView, 'communityCards' | 'cyclesPerRound'>, i: number): string {
  return game.communityCards[i] === null ? (i === game.cyclesPerRound - 1 ? 'Settlement' : `Cycle ${i + 2}`) : 'Revealed';
}

/** How each side of a quote reads in the interface: a bid buys, an ask sells. */
export const SIDE_TEXT = {
  bid: { label: 'Bid', withArticle: 'a bid', verb: 'buy', verbing: 'buying' },
  ask: { label: 'Ask', withArticle: 'an ask', verb: 'sell', verbing: 'selling' },
} as const;
