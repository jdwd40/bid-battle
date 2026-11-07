/** Injectable randomness. `next()` returns a float in [0, 1). */
export interface Rng {
  next(): number;
}

/** Deterministic mulberry32 generator for tests and reproducible simulations. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Cryptographically secure generator for normal play (uses Web Crypto, available in Node >= 19 and browsers). */
export function secureRng(): Rng {
  const buf = new Uint32Array(1);
  return {
    next() {
      globalThis.crypto.getRandomValues(buf);
      return buf[0] / 4294967296;
    },
  };
}

export function randomInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng.next() * (maxInclusive - minInclusive + 1));
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
