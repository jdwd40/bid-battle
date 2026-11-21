import { fairEstimate, type PlayerView } from '@bid-battle/engine';
import { fmt } from './format';

/** The local trader's fair estimate: own card + average of the unknown dealt cards. */
export function myFairEstimate(game: PlayerView): number | null {
  const card = game.seats[game.seat!]?.privateCard;
  if (card === null || card === undefined) return null;
  return fairEstimate(card, game.publicCards);
}

export function fairEstimateLine(game: PlayerView): string {
  const g = myFairEstimate(game);
  const card = game.seats[game.seat!].privateCard!;
  if (g === null) return '';
  const unknown = 7 - 1 - game.publicCards.length;
  const known = game.publicCards.length ? ` and the ${game.publicCards.length} face-up card${game.publicCards.length > 1 ? 's' : ''} (${game.publicCards.map(fmt).join(', ')})` : '';
  return `Your card is ${fmt(card)}${known}. The other ${unknown} hidden cards average about ${((g - card - game.publicCards.reduce((a, b) => a + b, 0)) / unknown).toFixed(1)} each, so your fair estimate of the settlement value is ${Math.round(g)}.`;
}

/** Suggested starter quote: a little below and above the fair estimate. */
export function suggestedQuote(game: PlayerView): { bid: number; ask: number } | null {
  const g = myFairEstimate(game);
  if (g === null) return null;
  const mid = Math.round(g);
  return { bid: Math.max(game.bounds.L, mid - 4), ask: Math.min(game.bounds.U, mid + 4) };
}

/** Plain-language advice for the current moment at the table. */
export function coachTip(game: PlayerView): { title: string; body: string } {
  const me = game.seat!;
  const g = myFairEstimate(game);
  const estimate = g === null ? null : Math.round(g);
  if (game.phase === 'QUOTE_PREPARATION') {
    const sealed = game.me?.sealedQuote;
    if (sealed?.confirmed) {
      return {
        title: 'Your quote is confirmed',
        body: 'When everyone has confirmed, all prices are shown at once and trading begins in turn. If someone trades with you, you get a contract at your price.',
      };
    }
    return {
      title: 'Step 1: set your two prices',
      body:
        `Think of a number for the settlement value (fair estimate: ${estimate}). ` +
        'Your BID is the price you would pay to buy a contract, so put it a bit below your fair estimate. ' +
        'Your ASK is the price you would sell at, so put it a bit above. The gap between them is your safety margin. ' +
        'Not sure? Use the suggested prices or skip this cycle and just watch.',
    };
  }
  if (game.phase === 'TRADING') {
    const pc = game.pendingCounter;
    if (pc && pc.target === me) {
      return {
        title: 'Someone wants a better price from you',
        body: `Accept only if the offered price is still good compared with your fair estimate of ${estimate}. Declining keeps your original price on the board.`,
      };
    }
    if (game.turnSeat === me && !pc) {
      const asks = game.seats.filter((s) => s.index !== me && s.quote.ask !== undefined).map((s) => s.quote.ask!);
      const bids = game.seats.filter((s) => s.index !== me && s.quote.bid !== undefined).map((s) => s.quote.bid!);
      const bestAsk = asks.length ? Math.min(...asks) : null;
      const bestBid = bids.length ? Math.max(...bids) : null;
      const parts: string[] = [`Your fair estimate of the settlement value is ${estimate}.`];
      if (bestAsk !== null) {
        parts.push(
          estimate !== null && bestAsk < estimate
            ? `Someone will sell to you at ${fmt(bestAsk)}, which is below your fair estimate, so BUYING looks attractive: you profit if the settlement value ends above ${fmt(bestAsk)}.`
            : `The cheapest seller wants ${fmt(bestAsk)}, which is not below your fair estimate, so buying there is not obviously good.`,
        );
      }
      if (bestBid !== null) {
        parts.push(
          estimate !== null && bestBid > estimate
            ? `Someone will buy from you at ${fmt(bestBid)}, which is above your fair estimate, so SELLING looks attractive: you profit if the settlement value ends below ${fmt(bestBid)}. You can sell even if you own nothing.`
            : `The highest buyer offers ${fmt(bestBid)}, which is not above your fair estimate, so selling there is not obviously good.`,
        );
      }
      if (bestAsk === null && bestBid === null) parts.push('Nobody has posted a price you can trade on, so passing is fine.');
      else parts.push('Passing is always allowed. Counter-offer lets you propose a price in between.');
      return { title: 'Step 2: your turn to trade (or pass)', body: parts.join(' ') };
    }
    return {
      title: 'Waiting for the other traders',
      body: 'Each trader gets one move per cycle. Watch what prices get taken: a lot of buying hints that others hold high cards. Your own posted prices can be traded against at any time.',
    };
  }
  return { title: '', body: '' };
}
