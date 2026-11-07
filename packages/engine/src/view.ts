import { evaluateQuote, publicBounds, type Bounds, type Portfolio, type QuoteSides } from './risk.js';
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

const REVEALED_PHASES: Phase[] = ['SETTLEMENT', 'ROUND_REVIEW', 'MATCH_COMPLETE'];

/**
 * Build the sanitised view for one seat (or an observer when seat is null).
 * Never includes other private cards, hidden community cards, unused cards,
 * or other players' sealed submissions.
 */
export function projectView(state: MatchState, seat: number | null, now: number, eventLimit = 60): PlayerView {
  const revealedAll = REVEALED_PHASES.includes(state.phase);
  const publicCards = state.communityCards.slice(0, state.revealedCount);
  const bounds = publicBounds(publicCards);
  const seats: SeatView[] = state.seats.map((s) => ({
    index: s.index,
    name: s.name,
    isBot: s.isBot,
    difficulty: s.difficulty,
    balance: s.balance,
    position: s.position,
    privateCard: s.index === seat || revealedAll ? s.privateCard : null,
    quote: state.phase === 'TRADING' ? { ...s.quote } : {},
    submissionConfirmed: state.phase === 'QUOTE_PREPARATION' ? Boolean(s.submission?.confirmed) : null,
    hasActedThisCycle: s.hasActedThisCycle,
    ready: s.ready,
  }));

  let me: LocalInfo | null = null;
  if (seat !== null) {
    const s = state.seats[seat];
    const portfolio: Portfolio = { B: s.roundStartBalance, q: s.position, C: s.cashflow };
    const outstanding: QuoteSides = state.phase === 'QUOTE_PREPARATION' ? { bid: s.submission?.bid, ask: s.submission?.ask } : s.quote;
    const clean: QuoteSides = {};
    if (outstanding.bid !== undefined) clean.bid = outstanding.bid;
    if (outstanding.ask !== undefined) clean.ask = outstanding.ask;
    const ev = evaluateQuote(portfolio, clean, bounds, state.config.positionLimit);
    me = {
      submission: s.submission ? { ...s.submission } : null,
      portfolio,
      reserved: ev.reserved,
      available: portfolio.B - ev.reserved,
      trades: s.trades.slice(),
    };
  }

  const communityCards = Array.from({ length: state.config.communityCards }, (_, i) =>
    i < state.revealedCount ? state.communityCards[i] : null,
  );

  return {
    seat,
    phase: state.phase,
    round: state.round,
    totalRounds: state.config.rounds,
    cycle: state.cycle,
    cyclesPerRound: state.config.cyclesPerRound,
    positionLimit: state.config.positionLimit,
    communityCards,
    publicCards,
    bounds,
    cycleStartSeat: state.cycleStartSeat,
    turnSeat: state.turnSeat,
    pendingCounter: state.pendingCounter ? { ...state.pendingCounter } : null,
    deadline: state.deadline,
    serverNow: now,
    version: state.version,
    phaseVersion: state.phaseVersion,
    seats,
    me,
    events: state.events.slice(-eventLimit),
    lastRound: state.roundHistory.length ? state.roundHistory[state.roundHistory.length - 1] : null,
    balanceHistory: state.roundHistory.map((r) => r.seats.map((x) => x.endBalance)),
    winners: state.winners,
  };
}

// ---------------- Bot observation ----------------

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
  publishedQuotes: Array<{ seat: number; bid?: number; ask?: number }>;
}

export function buildBotObservation(state: MatchState, seat: number): BotObservation {
  const s = state.seats[seat];
  const publicCards = state.communityCards.slice(0, state.revealedCount);
  const trading = state.phase === 'TRADING';
  const trades: Trade[] = [];
  let publishedQuotes: Array<{ seat: number; bid?: number; ask?: number }> = [];
  for (const e of state.events) {
    if (e.round !== state.round) continue;
    if (e.event.type === 'TRADE') trades.push(e.event.trade);
    if (e.event.type === 'QUOTES_PUBLISHED') publishedQuotes = e.event.quotes; // most recent publication this round
  }
  return {
    seat,
    phase: state.phase,
    round: state.round,
    cycle: state.cycle,
    cyclesPerRound: state.config.cyclesPerRound,
    ownCard: s.privateCard ?? 0,
    publicCards,
    bounds: publicBounds(publicCards),
    positionLimit: state.config.positionLimit,
    portfolio: { B: s.roundStartBalance, q: s.position, C: s.cashflow },
    myQuote: trading ? { ...s.quote } : {},
    opponents: state.seats
      .filter((o) => o.index !== seat)
      .map((o) => ({ seat: o.index, position: o.position, balance: o.balance, quote: trading ? { ...o.quote } : {} })),
    pendingCounterForMe: state.pendingCounter && state.pendingCounter.target === seat ? { ...state.pendingCounter } : null,
    tradesThisRound: trades,
    publishedQuotes,
  };
}
