import { type Difficulty } from './config.js';
import { type Rng } from './random.js';
import { type QuoteSides } from './risk.js';
import type { Command } from './types.js';
import type { BotObservation } from './view.js';
/**
 * Conditional expected settlement total given the cards a trader can see:
 * sum(known) + unknownDealt * mean(deck excluding known).
 */
export declare function expectedTotal(ownCard: number, publicCards: readonly number[]): number;
export interface Bot {
    readonly difficulty: Difficulty;
    decideQuote(obs: BotObservation, rng: Rng): QuoteSides;
    decideTurn(obs: BotObservation, rng: Rng): Command;
    decideCounter(obs: BotObservation, rng: Rng): boolean;
}
/** Shrink a desired quote until it is legal and affordable; may return an empty quote. */
export declare function fitQuote(obs: BotObservation, desired: QuoteSides): QuoteSides;
export declare function createBot(difficulty: Difficulty): Bot;
//# sourceMappingURL=bots.d.ts.map