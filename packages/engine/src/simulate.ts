import { createBot, type Bot } from './bots.js';
import type { Difficulty, MatchConfig } from './config.js';
import { GameEngine } from './engine.js';
import { seededRng, type Rng } from './random.js';
import type { CommandResult, SeatSetup } from './types.js';
import { buildBotObservation } from './view.js';

/** Let a bot act for `seat` given the engine's current wait state. Returns the engine result. */
export function botAct(engine: GameEngine, seat: number, bot: Bot, rng: Rng, now: number): CommandResult {
  const obs = buildBotObservation(engine.state, seat);
  switch (obs.phase) {
    case 'QUOTE_PREPARATION': {
      const q = bot.decideQuote(obs, rng);
      const res = engine.apply(seat, { type: 'SUBMIT_QUOTE', ...q, confirm: true }, now);
      return res.ok ? res : engine.apply(seat, { type: 'SUBMIT_QUOTE', confirm: true }, now);
    }
    case 'TRADING': {
      if (obs.pendingCounterForMe) {
        return engine.apply(seat, { type: 'RESPOND_COUNTER', counterId: obs.pendingCounterForMe.id, accept: bot.decideCounter(obs, rng) }, now);
      }
      const cmd = bot.decideTurn(obs, rng);
      const res = engine.apply(seat, cmd, now);
      return res.ok ? res : engine.apply(seat, { type: 'PASS' }, now);
    }
    case 'ROUND_REVIEW':
      return engine.apply(seat, { type: 'READY' }, now);
    default:
      return { ok: false, error: 'nothing to do' };
  }
}

export interface SimulationResult {
  engine: GameEngine;
  steps: number;
}

/**
 * Run a complete all-AI match deterministically (no timers needed: every seat
 * acts immediately when the engine waits on it).
 */
export function simulateMatch(seed: number, difficulties: Difficulty[] = ['easy', 'normal', 'hard', 'normal'], config?: Partial<MatchConfig>): SimulationResult {
  const rng = seededRng(seed);
  const seats: SeatSetup[] = difficulties.map((d, i) => ({ name: `Bot ${i + 1}`, isBot: true, difficulty: d }));
  const engine = new GameEngine(seats, { rng, config });
  const bots = difficulties.map((d) => createBot(d));
  let now = 0;
  engine.startMatch(now);
  let steps = 0;
  while (engine.phase !== 'MATCH_COMPLETE') {
    const waiting = engine.awaitingSeats();
    if (!waiting.length) throw new Error(`engine stalled in ${engine.phase}`);
    const seat = waiting[0];
    now += 1;
    botAct(engine, seat, bots[seat], rng, now);
    if (++steps > 100_000) throw new Error('simulation did not terminate');
  }
  return { engine, steps };
}
