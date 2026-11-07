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

export const DEFAULT_CONFIG: MatchConfig = {
  seats: 4,
  startingCredits: 100,
  rounds: 10,
  cyclesPerRound: 3,
  communityCards: 3,
  positionLimit: 2,
  timers: {
    quotePrepMs: 20_000,
    turnMs: 20_000,
    counterMs: 10_000,
    reviewMs: 30_000,
  },
};

/** The 17-card deck: 1..15, -10, -20. */
export const FULL_DECK: readonly number[] = Object.freeze([
  ...Array.from({ length: 15 }, (_, i) => i + 1),
  -10,
  -20,
]);

export const DEALT_CARD_COUNT = 7; // 4 private + 3 community

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
