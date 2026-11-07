import type { LoggedEvent, Phase } from '@bid-battle/engine';
import type { SeatView } from '@bid-battle/engine';
/** Format a number using a true minus sign so negatives are unmistakable. */
export declare function fmt(n: number): string;
/** Signed P&L formatting: +4 / −7 / 0. */
export declare function fmtSigned(n: number): string;
export declare function fmtPosition(q: number): string;
export declare function phaseLabel(phase: Phase): string;
export declare function describeEvent(e: LoggedEvent, seats: SeatView[]): string | null;
export declare function difficultyLabel(d: string): string;
//# sourceMappingURL=format.d.ts.map