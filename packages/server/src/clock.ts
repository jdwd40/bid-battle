/** Injectable clock so timers are testable with fake time. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, Math.max(0, ms)),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

interface Scheduled {
  id: number;
  at: number;
  fn: () => void;
}

/** Deterministic fake clock: `advance(ms)` fires timers in order. */
export class FakeClock implements Clock {
  private t = 0;
  private nextId = 1;
  private queue: Scheduled[] = [];

  now() {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number) {
    const s: Scheduled = { id: this.nextId++, at: this.t + Math.max(0, ms), fn };
    this.queue.push(s);
    return s.id;
  }

  clearTimeout(handle: unknown) {
    this.queue = this.queue.filter((s) => s.id !== handle);
  }

  advance(ms: number) {
    const target = this.t + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.queue[0];
      if (!next || next.at > target) break;
      this.queue.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = target;
  }

  /** Fire every timer that is due now (without moving time). */
  flush() {
    this.advance(0);
  }

  pending() {
    return this.queue.length;
  }
}
