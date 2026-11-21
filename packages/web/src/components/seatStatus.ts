import type { PlayerView, SeatView } from '@bid-battle/engine';
import type { ClientView } from '../../../server/src/protocol';

/** Where a seat stands this moment, shared by the desktop seat tile and the phone trader row. */
export interface SeatStatus {
  /** It is this seat's turn to trade. */
  active: boolean;
  /** A bot is playing a disconnected player's seat (a takeover). */
  takenOver: boolean;
  /** During quote preparation: preparing or confirmed. During trading: acted, once its turn is over. */
  progress: 'preparing' | 'confirmed' | 'acted' | null;
}

export function seatStatus(seat: SeatView, game: PlayerView, view: ClientView): SeatStatus {
  const trading = game.phase === 'TRADING';
  const active = trading && game.turnSeat === seat.index;
  const progress =
    game.phase === 'QUOTE_PREPARATION' ? (seat.sealedQuoteConfirmed ? 'confirmed' : 'preparing') : trading && seat.hasActedThisCycle && !active ? 'acted' : null;
  return { active, takenOver: view.botControlled[seat.index] && !seat.isBot, progress };
}
