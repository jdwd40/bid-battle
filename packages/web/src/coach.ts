import { expectedTotal, type PlayerView } from '@bid-battle/engine';
import { fmt } from './format';

/** A rough fair-value guess for the local player: own card + average of the unknown dealt cards. */
export function roughGuess(game: PlayerView): number | null {
  const card = game.seats[game.seat!]?.privateCard;
  if (card === null || card === undefined) return null;
  return expectedTotal(card, game.publicCards);
}

export function guessLine(game: PlayerView): string {
  const g = roughGuess(game);
  const card = game.seats[game.seat!].privateCard!;
  if (g === null) return '';
  const unknown = 7 - 1 - game.publicCards.length;
  const known = game.publicCards.length ? ` and the ${game.publicCards.length} face-up card${game.publicCards.length > 1 ? 's' : ''} (${game.publicCards.map(fmt).join(', ')})` : '';
  return `Your card is ${fmt(card)}${known}. The other ${unknown} hidden cards average about ${((g - card - game.publicCards.reduce((a, b) => a + b, 0)) / unknown).toFixed(1)} each, so a rough guess for the final total is ${Math.round(g)}.`;
}

/** Suggested starter quote: a little below and above the rough guess. */
export function suggestedQuote(game: PlayerView): { bid: number; ask: number } | null {
  const g = roughGuess(game);
  if (g === null) return null;
  const mid = Math.round(g);
  return { bid: Math.max(game.bounds.L, mid - 4), ask: Math.min(game.bounds.U, mid + 4) };
}

/** Plain-language advice for the current moment at the table. */
export function coachTip(game: PlayerView): { title: string; body: string } {
  const me = game.seat!;
  const g = roughGuess(game);
  const guess = g === null ? null : Math.round(g);
  if (game.phase === 'QUOTE_PREPARATION') {
    const sub = game.me?.submission;
    if (sub?.confirmed) {
      return {
        title: 'Your prices are locked in',
        body: 'When everyone has locked in, all prices are shown at once and trading begins in turn. If someone trades with you, you get a contract at your price.',
      };
    }
    return {
      title: 'Step 1: set your two prices',
      body:
        `Think of a number for the final total (rough guess: ${guess}). ` +
        'Your BID is the price you would pay to buy a contract, so put it a bit below your guess. ' +
        'Your ASK is the price you would sell at, so put it a bit above. The gap between them is your safety margin. ' +
        'Not sure? Use the suggested prices or skip this cycle and just watch.',
    };
  }
  if (game.phase === 'TRADING') {
    const pc = game.pendingCounter;
    if (pc && pc.target === me) {
      return {
        title: 'Someone wants a better price from you',
        body: `Accept only if the offered price is still good compared with your guess of ${guess}. Declining keeps your original price on the board.`,
      };
    }
    if (game.turnSeat === me && !pc) {
      const asks = game.seats.filter((s) => s.index !== me && s.quote.ask !== undefined).map((s) => s.quote.ask!);
      const bids = game.seats.filter((s) => s.index !== me && s.quote.bid !== undefined).map((s) => s.quote.bid!);
      const bestAsk = asks.length ? Math.min(...asks) : null;
      const bestBid = bids.length ? Math.max(...bids) : null;
      const parts: string[] = [`Your rough guess for the total is ${guess}.`];
      if (bestAsk !== null) {
        parts.push(
          guess !== null && bestAsk < guess
            ? `Someone will sell to you at ${fmt(bestAsk)}, which is below your guess, so BUYING looks attractive: you profit if the total ends above ${fmt(bestAsk)}.`
            : `The cheapest seller wants ${fmt(bestAsk)}, which is not below your guess, so buying there is not obviously good.`,
        );
      }
      if (bestBid !== null) {
        parts.push(
          guess !== null && bestBid > guess
            ? `Someone will buy from you at ${fmt(bestBid)}, which is above your guess, so SELLING looks attractive: you profit if the total ends below ${fmt(bestBid)}. You can sell even if you own nothing.`
            : `The highest buyer offers ${fmt(bestBid)}, which is not above your guess, so selling there is not obviously good.`,
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
