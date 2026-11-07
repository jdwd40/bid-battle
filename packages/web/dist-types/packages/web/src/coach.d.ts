import { type PlayerView } from '@bid-battle/engine';
/** A rough fair-value guess for the local player: own card + average of the unknown dealt cards. */
export declare function roughGuess(game: PlayerView): number | null;
export declare function guessLine(game: PlayerView): string;
/** Suggested starter quote: a little below and above the rough guess. */
export declare function suggestedQuote(game: PlayerView): {
    bid: number;
    ask: number;
} | null;
/** Plain-language advice for the current moment at the table. */
export declare function coachTip(game: PlayerView): {
    title: string;
    body: string;
};
//# sourceMappingURL=coach.d.ts.map