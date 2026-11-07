import { type MatchConfig } from './config.js';
import { type Rng } from './random.js';
import { type Bounds, type Portfolio } from './risk.js';
import type { Command, CommandResult, MatchState, SeatSetup } from './types.js';
export interface EngineOptions {
    config?: Partial<MatchConfig>;
    rng?: Rng;
    /** Test hook: supply the full 17-card deck order for a given round instead of shuffling. */
    deckProvider?: (round: number) => number[];
}
/**
 * Authoritative Bid Battle match engine. Framework independent and fully
 * deterministic given its Rng and the `now` timestamps passed into it.
 */
export declare class GameEngine {
    readonly state: MatchState;
    private readonly rng;
    private readonly deckProvider?;
    constructor(seats: SeatSetup[], opts?: EngineOptions);
    get phase(): import("./types.js").Phase;
    publicCards(): number[];
    bounds(): Bounds;
    portfolioOf(seat: number): Portfolio;
    /** Seats whose decision the engine is currently waiting on. */
    awaitingSeats(): number[];
    startMatch(now: number): CommandResult;
    private startRound;
    private startCycle;
    private publishQuotes;
    private beginTurn;
    private advanceTurn;
    private endCycle;
    private revealCommunity;
    private settle;
    private maybeFinishReview;
    private nextRound;
    /** Apply any deadline that has passed. Returns true if state changed. */
    tick(now: number): boolean;
    apply(seat: number, cmd: Command, now: number): CommandResult;
    private submitQuote;
    private requireTurn;
    /** BUY takes an ask; SELL takes a bid. */
    private takeQuote;
    private counter;
    private respondCounter;
    private pass;
    private ready;
    private checkExecution;
    private executeTrade;
    /** Cancel quote sides that became unsafe after a position change, logging each cancellation. */
    private trimQuotes;
    private log;
}
//# sourceMappingURL=engine.d.ts.map