/** Central gameplay configuration. All match constants live here. */
export interface MatchConfig {
    seats: number;
    startingCredits: number;
    rounds: number;
    cyclesPerRound: number;
    communityCards: number;
    positionLimit: number;
    timers: {
        quotePrepMs: number;
        turnMs: number;
        counterMs: number;
        reviewMs: number;
    };
}
export declare const DEFAULT_CONFIG: MatchConfig;
/** The 17-card deck: 1..15, -10, -20. */
export declare const FULL_DECK: readonly number[];
export declare const DEALT_CARD_COUNT = 7;
export type Difficulty = 'easy' | 'normal' | 'hard';
export declare const DIFFICULTIES: Difficulty[];
//# sourceMappingURL=config.d.ts.map