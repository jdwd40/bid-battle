import { type PlayerView } from '@bid-battle/engine';
/** The local trader's fair estimate: own card + average of the unknown dealt cards. */
export declare function myFairEstimate(game: PlayerView): number | null;
export declare function fairEstimateLine(game: PlayerView): string;
/** Suggested starter quote: a little below and above the fair estimate. */
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