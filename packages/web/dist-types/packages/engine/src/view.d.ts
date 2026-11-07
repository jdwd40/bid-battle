import { type Bounds, type Portfolio, type QuoteSides } from './risk.js';
import type { LoggedEvent, MatchState, PendingCounter, Phase, QuoteSubmission, RoundResult, SeatTradeRecord, Trade } from './types.js';
import type { Difficulty } from './config.js';
export interface SeatView {
    index: number;
    name: string;
    isBot: boolean;
    difficulty: Difficulty;
    balance: number;
    position: number;
    /** Private card: visible for the viewer's own seat, or for everyone once the round is settled. */
    privateCard: number | null;
    /** Published quote (only populated during TRADING). */
    quote: QuoteSides;
    /** Whether the seat has confirmed its sealed submission (QUOTE_PREPARATION only). */
    submissionConfirmed: boolean | null;
    hasActedThisCycle: boolean;
    ready: boolean;
}
export interface LocalInfo {
    submission: QuoteSubmission | null;
    portfolio: Portfolio;
    reserved: number;
    available: number;
    trades: SeatTradeRecord[];
}
export interface PlayerView {
    seat: number | null;
    phase: Phase;
    round: number;
    totalRounds: number;
    cycle: number;
    cyclesPerRound: number;
    positionLimit: number;
    communityCards: Array<number | null>;
    publicCards: number[];
    bounds: Bounds;
    cycleStartSeat: number;
    turnSeat: number | null;
    pendingCounter: PendingCounter | null;
    deadline: number | null;
    serverNow: number;
    version: number;
    phaseVersion: number;
    seats: SeatView[];
    me: LocalInfo | null;
    events: LoggedEvent[];
    lastRound: RoundResult | null;
    balanceHistory: number[][];
    winners: number[] | null;
}
/**
 * Build the sanitised view for one seat (or an observer when seat is null).
 * Never includes other private cards, hidden community cards, unused cards,
 * or other players' sealed submissions.
 */
export declare function projectView(state: MatchState, seat: number | null, now: number, eventLimit?: number): PlayerView;
export interface OpponentObservation {
    seat: number;
    position: number;
    balance: number;
    quote: QuoteSides;
}
/**
 * Structurally restricted input for AI decision making.
 * Built field-by-field; it is impossible for hidden data to appear here.
 */
export interface BotObservation {
    seat: number;
    phase: Phase;
    round: number;
    cycle: number;
    cyclesPerRound: number;
    ownCard: number;
    publicCards: number[];
    bounds: Bounds;
    positionLimit: number;
    portfolio: Portfolio;
    myQuote: QuoteSides;
    opponents: OpponentObservation[];
    pendingCounterForMe: PendingCounter | null;
    /** Trades executed so far this round (all public). */
    tradesThisRound: Trade[];
    /** Most recently published quotes this round (public). */
    publishedQuotes: Array<{
        seat: number;
        bid?: number;
        ask?: number;
    }>;
}
export declare function buildBotObservation(state: MatchState, seat: number): BotObservation;
//# sourceMappingURL=view.d.ts.map