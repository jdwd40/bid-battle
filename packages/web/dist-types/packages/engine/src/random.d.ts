/** Injectable randomness. `next()` returns a float in [0, 1). */
export interface Rng {
    next(): number;
}
/** Deterministic mulberry32 generator for tests and reproducible simulations. */
export declare function seededRng(seed: number): Rng;
/** Cryptographically secure generator for normal play (uses Web Crypto, available in Node >= 19 and browsers). */
export declare function secureRng(): Rng;
export declare function randomInt(rng: Rng, minInclusive: number, maxInclusive: number): number;
/** Fisher-Yates shuffle (returns a new array). */
export declare function shuffle<T>(items: readonly T[], rng: Rng): T[];
//# sourceMappingURL=random.d.ts.map