import type { Difficulty, MatchConfig } from './config.js';
import type { Bounds, Cancellation, QuoteSides } from './risk.js';

export type Phase =
  | 'LOBBY'
  | 'DEAL'
  | 'QUOTE_PREPARATION'
  | 'TRADING'
  | 'SETTLEMENT'
  | 'ROUND_REVIEW'
  | 'MATCH_COMPLETE';

export type Side = 'bid' | 'ask';

export interface SeatSetup {
  name: string;
  isBot: boolean;
  difficulty: Difficulty;
}

/** Information a trader had when they made a trade (for the educational review). */
export interface TradeContext {
  ownCard: number;
  publicCards: number[];
  bounds: Bounds;
  cycle: number;
}

export interface Trade {
  id: number;
  round: number;
  cycle: number;
  buyer: number;
  seller: number;
  price: number;
  /** 'quote' = accepted a published quote, 'counter' = negotiated price. */
  via: 'quote' | 'counter';
  /** Who initiated (took the action). */
  initiator: number;
}

export interface SeatTradeRecord {
  tradeId: number;
  cycle: number;
  side: 'BUY' | 'SELL';
  price: number;
  counterparty: number;
  via: 'quote' | 'counter';
  context: TradeContext;
}

export interface QuoteSubmission {
  bid?: number;
  ask?: number;
  confirmed: boolean;
}

export interface SeatState {
  index: number;
  name: string;
  isBot: boolean;
  difficulty: Difficulty;
  balance: number;
  /** Balance at the start of the current round (B). */
  roundStartBalance: number;
  privateCard: number | null;
  /** Net position q. */
  position: number;
  /** Cashflow offset C. */
  cashflow: number;
  /** Sealed submission during QUOTE_PREPARATION. */
  submission: QuoteSubmission | null;
  /** Published quote during TRADING (sides disappear when filled/cancelled). */
  quote: QuoteSides;
  trades: SeatTradeRecord[];
  hasActedThisCycle: boolean;
  ready: boolean;
}

export interface PendingCounter {
  id: number;
  from: number;
  target: number;
  /** Which side of the target's quote is being countered. */
  side: Side;
  /** The target's quoted price at proposal time. */
  quotedPrice: number;
  /** Proposed price. */
  price: number;
}

export interface SeatRoundResult {
  seat: number;
  roundStartBalance: number;
  position: number;
  cashflow: number;
  pnl: number;
  endBalance: number;
  trades: SeatTradeRecord[];
}

export interface RoundResult {
  round: number;
  privateCards: number[];
  communityCards: number[];
  settlementValue: number;
  seats: SeatRoundResult[];
}

export type GameEvent =
  | { type: 'MATCH_STARTED'; firstSeat: number }
  | { type: 'ROUND_STARTED'; round: number }
  | { type: 'CYCLE_STARTED'; round: number; cycle: number; firstSeat: number }
  | { type: 'QUOTE_CONFIRMED'; seat: number }
  | { type: 'QUOTES_PUBLISHED'; quotes: Array<{ seat: number; bid?: number; ask?: number }> }
  | { type: 'QUOTES_EXPIRED'; cycle: number }
  | { type: 'COMMUNITY_REVEALED'; index: number; card: number }
  | { type: 'TURN_STARTED'; seat: number }
  | { type: 'TRADE'; trade: Trade }
  | { type: 'PASS'; seat: number; reason: 'manual' | 'timeout' | 'auto' }
  | { type: 'COUNTER_PROPOSED'; counter: PendingCounter }
  | { type: 'COUNTER_ACCEPTED'; counterId: number }
  | { type: 'COUNTER_DECLINED'; counterId: number; reason: 'manual' | 'timeout' }
  | { type: 'QUOTE_CANCELLED'; seat: number; cancellation: Cancellation }
  | { type: 'SETTLED'; result: RoundResult }
  | { type: 'PLAYER_READY'; seat: number }
  | { type: 'MATCH_COMPLETE'; winners: number[] };

export interface LoggedEvent {
  seq: number;
  round: number;
  cycle: number;
  at: number;
  event: GameEvent;
}

export interface MatchState {
  config: MatchConfig;
  phase: Phase;
  round: number;
  cycle: number;
  seats: SeatState[];
  communityCards: number[];
  revealedCount: number;
  unusedCards: number[];
  /** Seat that opens the current trading cycle. */
  cycleStartSeat: number;
  turnSeat: number | null;
  pendingCounter: PendingCounter | null;
  deadline: number | null;
  /** Increments on every state change. */
  version: number;
  /** Increments only at phase/turn boundaries; clients echo it to detect stale commands. */
  phaseVersion: number;
  events: LoggedEvent[];
  roundHistory: RoundResult[];
  nextTradeId: number;
  nextCounterId: number;
  winners: number[] | null;
}

export type Command =
  | { type: 'SUBMIT_QUOTE'; bid?: number; ask?: number; confirm: boolean }
  | { type: 'BUY'; target: number; price: number }
  | { type: 'SELL'; target: number; price: number }
  | { type: 'COUNTER'; target: number; side: Side; price: number }
  | { type: 'RESPOND_COUNTER'; counterId: number; accept: boolean }
  | { type: 'PASS' }
  | { type: 'READY' };

export type CommandResult = { ok: true } | { ok: false; error: string };
