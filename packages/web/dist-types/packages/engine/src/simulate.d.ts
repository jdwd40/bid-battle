import { type Bot } from './bots.js';
import type { Difficulty, MatchConfig } from './config.js';
import { GameEngine } from './engine.js';
import { type Rng } from './random.js';
import type { CommandResult } from './types.js';
/** Let a bot act for `seat` given the engine's current wait state. Returns the engine result. */
export declare function botAct(engine: GameEngine, seat: number, bot: Bot, rng: Rng, now: number): CommandResult;
export interface SimulationResult {
    engine: GameEngine;
    steps: number;
}
/**
 * Run a complete all-AI match deterministically (no timers needed: every seat
 * acts immediately when the engine waits on it).
 */
export declare function simulateMatch(seed: number, difficulties?: Difficulty[], config?: Partial<MatchConfig>): SimulationResult;
//# sourceMappingURL=simulate.d.ts.map