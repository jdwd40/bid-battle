import {
  GameEngine,
  botAct,
  createBot,
  projectView,
  type Bot,
  type Command,
  type CommandResult,
  type Difficulty,
  type MatchConfig,
  type Rng,
  type SeatSetup,
} from '@bid-battle/engine';
import type { Clock } from './clock.js';
import type { ClientView, CommandRequest, LobbyView, SeatKind } from './protocol.js';
import { validateCommand } from './validate.js';

export interface Player {
  token: string;
  name: string;
  seat: number;
  connected: boolean;
  disconnectedAt: number | null;
}

interface LobbySeat {
  kind: SeatKind;
  difficulty: Difficulty;
  token: string | null;
}

export interface RoomOptions {
  clock: Clock;
  /** Presentation delay before a bot acts. */
  botDelayMs: number;
  rng?: Rng;
  config?: Partial<MatchConfig>;
  tokenFactory: () => string;
  /** Called whenever any player-visible state changed. */
  onChange: (room: Room) => void;
  /** Server-side audit sink (never sent to clients). */
  audit?: (room: Room, entry: Record<string, unknown>) => void;
}

const MAX_SEATS = 4;
const COMMAND_CACHE_LIMIT = 1000;

/**
 * One table. Owns the lobby, the authoritative engine, bot scheduling,
 * timers and per-player view construction.
 */
export class Room {
  readonly code: string;
  hostToken: string | null = null;
  readonly players = new Map<string, Player>();
  readonly seats: LobbySeat[] = Array.from({ length: MAX_SEATS }, () => ({ kind: 'bot', difficulty: 'normal', token: null }));
  engine: GameEngine | null = null;
  private deadlineTimer: unknown = null;
  private botTimers = new Map<number, unknown>();
  private bots: Bot[] = [];
  private readonly takeoverBot = createBot('normal');
  private readonly commandCache = new Map<string, CommandResult>();
  private readonly rng: Rng;
  createdAt: number;

  constructor(code: string, private readonly opts: RoomOptions) {
    this.code = code;
    this.rng = opts.rng ?? { next: () => Math.random() };
    this.createdAt = opts.clock.now();
  }

  get started() {
    return this.engine !== null;
  }

  get clock() {
    return this.opts.clock;
  }

  // ---------------- lobby ----------------

  addPlayer(name: string): { ok: true; token: string; seat: number } | { ok: false; error: string } {
    if (this.started) return { ok: false, error: 'the match has already started; new players cannot join' };
    const clean = name.trim().slice(0, 20);
    if (!clean) return { ok: false, error: 'please enter a display name' };
    const seat = this.seats.findIndex((s) => s.kind !== 'human');
    if (seat < 0) return { ok: false, error: 'the table is full' };
    const token = this.opts.tokenFactory();
    this.players.set(token, { token, name: clean, seat, connected: true, disconnectedAt: null });
    this.seats[seat] = { kind: 'human', difficulty: 'normal', token };
    if (!this.hostToken) this.hostToken = token;
    this.changed();
    return { ok: true, token, seat };
  }

  /** Explicit leave before the match starts frees the seat. During a match it is a disconnect. */
  removePlayer(token: string) {
    const p = this.players.get(token);
    if (!p) return;
    if (this.started) {
      this.disconnect(token);
      return;
    }
    this.players.delete(token);
    this.seats[p.seat] = { kind: 'bot', difficulty: 'normal', token: null };
    if (this.hostToken === token) this.transferHost();
    this.changed();
  }

  private transferHost() {
    const next = [...this.players.values()].find((p) => p.connected) ?? [...this.players.values()][0];
    this.hostToken = next ? next.token : null;
  }

  setSeat(token: string, seat: number, difficulty: Difficulty): CommandResult {
    if (token !== this.hostToken) return { ok: false, error: 'only the host can change AI settings' };
    if (this.started) return { ok: false, error: 'the match has already started' };
    if (!Number.isInteger(seat) || seat < 0 || seat >= MAX_SEATS) return { ok: false, error: 'invalid seat' };
    if (!['easy', 'normal', 'hard'].includes(difficulty)) return { ok: false, error: 'invalid difficulty' };
    if (this.seats[seat].kind === 'human') return { ok: false, error: 'that seat is taken by a player' };
    this.seats[seat] = { kind: 'bot', difficulty, token: null };
    this.changed();
    return { ok: true };
  }

  start(token: string): CommandResult {
    if (token !== this.hostToken) return { ok: false, error: 'only the host can start the match' };
    if (this.started) return { ok: false, error: 'the match has already started' };
    const setups: SeatSetup[] = this.seats.map((s, i) => {
      if (s.kind === 'human') {
        const p = this.players.get(s.token!)!;
        return { name: p.name, isBot: false, difficulty: 'normal' };
      }
      return { name: `${s.difficulty[0].toUpperCase()}${s.difficulty.slice(1)} Bot ${i + 1}`, isBot: true, difficulty: s.difficulty };
    });
    this.bots = setups.map((s) => createBot(s.difficulty));
    this.engine = new GameEngine(setups, { rng: this.rng, config: this.opts.config });
    this.engine.startMatch(this.clock.now());
    this.audit({ type: 'MATCH_STARTED', seats: setups.map((s) => s.name) });
    this.afterStateChange();
    return { ok: true };
  }

  // ---------------- connections ----------------

  disconnect(token: string) {
    const p = this.players.get(token);
    if (!p || !p.connected) return;
    p.connected = false;
    p.disconnectedAt = this.clock.now();
    if (!this.started) {
      if (this.hostToken === token) this.transferHost();
      this.changed();
      return;
    }
    // AI takeover happens at the next decision boundary via scheduling.
    this.afterStateChange();
  }

  reconnect(token: string): Player | null {
    const p = this.players.get(token);
    if (!p) return null;
    p.connected = true;
    p.disconnectedAt = null;
    // Safe boundary: cancel any not-yet-fired AI action for this seat so the human reclaims control.
    const t = this.botTimers.get(p.seat);
    if (t !== undefined) {
      this.clock.clearTimeout(t);
      this.botTimers.delete(p.seat);
    }
    if (!this.hostToken || !this.players.get(this.hostToken)?.connected) this.hostToken = token;
    this.afterStateChange();
    return p;
  }

  isAiControlled(seat: number): boolean {
    const s = this.seats[seat];
    if (s.kind !== 'human') return true;
    const p = this.players.get(s.token!);
    return !p || !p.connected;
  }

  hasConnectedHumans(): boolean {
    return [...this.players.values()].some((p) => p.connected);
  }

  // ---------------- commands ----------------

  command(req: CommandRequest): CommandResult {
    const p = this.players.get(req.token);
    if (!p) return { ok: false, error: 'you are not seated at this table' };
    if (!this.engine) return { ok: false, error: 'the match has not started' };
    if (typeof req.commandId !== 'string' || !req.commandId) return { ok: false, error: 'missing command id' };
    const cacheKey = `${req.token}:${req.commandId}`;
    const cached = this.commandCache.get(cacheKey);
    if (cached) return cached;
    const invalid = validateCommand(req.action);
    let result: CommandResult;
    if (invalid) {
      result = { ok: false, error: invalid };
    } else if (typeof req.phaseVersion !== 'number' || req.phaseVersion !== this.engine.state.phaseVersion) {
      result = { ok: false, error: 'the table has moved on since that action; please look again' };
    } else {
      result = this.engine.apply(p.seat, req.action, this.clock.now());
    }
    this.remember(cacheKey, result);
    this.audit({ type: 'COMMAND', seat: p.seat, action: req.action, result });
    if (result.ok) this.afterStateChange();
    return result;
  }

  private remember(key: string, result: CommandResult) {
    this.commandCache.set(key, result);
    if (this.commandCache.size > COMMAND_CACHE_LIMIT) {
      const first = this.commandCache.keys().next().value;
      if (first !== undefined) this.commandCache.delete(first);
    }
  }

  // ---------------- driver ----------------

  private afterStateChange() {
    this.scheduleDeadline();
    this.scheduleBots();
    this.changed();
  }

  private scheduleDeadline() {
    const engine = this.engine;
    if (this.deadlineTimer !== null) {
      this.clock.clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
    if (!engine || engine.state.deadline === null) return;
    const wait = engine.state.deadline - this.clock.now();
    this.deadlineTimer = this.clock.setTimeout(() => {
      this.deadlineTimer = null;
      if (engine.tick(this.clock.now())) {
        this.audit({ type: 'TIMEOUT', phase: engine.phase });
        this.afterStateChange();
      } else {
        this.scheduleDeadline();
      }
    }, wait);
  }

  private scheduleBots() {
    const engine = this.engine;
    if (!engine) return;
    const awaiting = new Set(engine.awaitingSeats());
    // Drop timers for seats no longer awaited.
    for (const [seat, handle] of [...this.botTimers]) {
      if (!awaiting.has(seat) || !this.isAiControlled(seat)) {
        this.clock.clearTimeout(handle);
        this.botTimers.delete(seat);
      }
    }
    for (const seat of awaiting) {
      if (!this.isAiControlled(seat) || this.botTimers.has(seat)) continue;
      const handle = this.clock.setTimeout(() => {
        this.botTimers.delete(seat);
        if (!this.isAiControlled(seat) || !engine.awaitingSeats().includes(seat)) return;
        const bot = this.seats[seat].kind === 'human' ? this.takeoverBot : this.bots[seat];
        const res = botAct(engine, seat, bot, this.rng, this.clock.now());
        this.audit({ type: 'BOT_ACTION', seat, phase: engine.phase, result: res });
        this.afterStateChange();
      }, this.opts.botDelayMs);
      this.botTimers.set(seat, handle);
    }
  }

  private changed() {
    this.opts.onChange(this);
  }

  private audit(entry: Record<string, unknown>) {
    this.opts.audit?.(this, { at: this.clock.now(), ...entry });
  }

  // ---------------- views ----------------

  lobbyView(): LobbyView {
    return {
      code: this.code,
      started: this.started,
      seats: this.seats.map((s, index) => {
        const p = s.token ? this.players.get(s.token) : undefined;
        return {
          index,
          kind: s.kind,
          name: p ? p.name : `${s.difficulty[0].toUpperCase()}${s.difficulty.slice(1)} Bot ${index + 1}`,
          difficulty: s.difficulty,
          connected: p ? p.connected : true,
          isHost: s.token !== null && s.token === this.hostToken,
        };
      }),
    };
  }

  viewFor(token: string): ClientView | null {
    const p = this.players.get(token);
    if (!p) return null;
    return {
      room: this.lobbyView(),
      seat: p.seat,
      isHost: token === this.hostToken,
      aiControlled: this.seats.map((_, i) => this.isAiControlled(i)),
      connected: this.seats.map((s) => (s.token ? Boolean(this.players.get(s.token)?.connected) : true)),
      game: this.engine ? projectView(this.engine.state, p.seat, this.clock.now()) : null,
    };
  }

  dispose() {
    if (this.deadlineTimer !== null) this.clock.clearTimeout(this.deadlineTimer);
    for (const h of this.botTimers.values()) this.clock.clearTimeout(h);
    this.botTimers.clear();
  }
}

/** Validate a client-supplied command payload shape. Exported for tests. */
export function isCommand(x: unknown): x is Command {
  return validateCommand(x) === null;
}
