import { DEFAULT_CONFIG, FULL_DECK, type MatchConfig } from './config.js';
import { randomInt, secureRng, shuffle, type Rng } from './random.js';
import {
  applyBuy,
  applySell,
  checkPortfolio,
  evaluateQuote,
  publicBounds,
  trimQuote,
  validateQuotePrices,
  type Bounds,
  type Portfolio,
  type QuoteSides,
} from './risk.js';
import type {
  Command,
  CommandResult,
  GameEvent,
  MatchState,
  PendingCounter,
  RoundResult,
  SeatSetup,
  SeatState,
  Side,
  Trade,
  TradeContext,
} from './types.js';

export interface EngineOptions {
  config?: Partial<MatchConfig>;
  rng?: Rng;
  /** Test hook: supply the full 17-card deck order for a given round instead of shuffling. */
  deckProvider?: (round: number) => number[];
}

const fail = (error: string): CommandResult => ({ ok: false, error });
const OK: CommandResult = { ok: true };

/**
 * Authoritative Bid Battle match engine. Framework independent and fully
 * deterministic given its Rng and the `now` timestamps passed into it.
 */
export class GameEngine {
  readonly state: MatchState;
  private readonly rng: Rng;
  private readonly deckProvider?: (round: number) => number[];

  constructor(seats: SeatSetup[], opts: EngineOptions = {}) {
    this.deckProvider = opts.deckProvider;
    const config: MatchConfig = { ...DEFAULT_CONFIG, ...opts.config, timers: { ...DEFAULT_CONFIG.timers, ...opts.config?.timers } };
    if (seats.length !== config.seats) throw new Error(`exactly ${config.seats} seats required`);
    this.rng = opts.rng ?? secureRng();
    this.state = {
      config,
      phase: 'LOBBY',
      round: 0,
      cycle: 0,
      seats: seats.map((s, index) => ({
        index,
        name: s.name,
        isBot: s.isBot,
        difficulty: s.difficulty,
        balance: config.startingCredits,
        roundStartBalance: config.startingCredits,
        privateCard: null,
        position: 0,
        cashflow: 0,
        submission: null,
        quote: {},
        trades: [],
        hasActedThisCycle: false,
        ready: false,
      })),
      communityCards: [],
      revealedCount: 0,
      unusedCards: [],
      cycleStartSeat: 0,
      turnSeat: null,
      pendingCounter: null,
      deadline: null,
      version: 0,
      phaseVersion: 0,
      events: [],
      roundHistory: [],
      nextTradeId: 1,
      nextCounterId: 1,
      winners: null,
    };
  }

  // ---------- public helpers ----------

  get phase() {
    return this.state.phase;
  }

  publicCards(): number[] {
    return this.state.communityCards.slice(0, this.state.revealedCount);
  }

  bounds(): Bounds {
    return publicBounds(this.publicCards());
  }

  portfolioOf(seat: number): Portfolio {
    const s = this.state.seats[seat];
    return { B: s.roundStartBalance, q: s.position, C: s.cashflow };
  }

  /** Seats whose decision the engine is currently waiting on. */
  awaitingSeats(): number[] {
    const st = this.state;
    switch (st.phase) {
      case 'QUOTE_PREPARATION':
        return st.seats.filter((s) => !s.submission?.confirmed).map((s) => s.index);
      case 'TRADING':
        if (st.pendingCounter) return [st.pendingCounter.target];
        return st.turnSeat === null ? [] : [st.turnSeat];
      case 'ROUND_REVIEW':
        return st.seats.filter((s) => !s.ready).map((s) => s.index);
      default:
        return [];
    }
  }

  // ---------- lifecycle ----------

  startMatch(now: number): CommandResult {
    const st = this.state;
    if (st.phase !== 'LOBBY') return fail('match already started');
    st.cycleStartSeat = randomInt(this.rng, 0, st.config.seats - 1);
    this.log({ type: 'MATCH_STARTED', firstSeat: st.cycleStartSeat }, now);
    this.startRound(now);
    return OK;
  }

  private startRound(now: number) {
    const st = this.state;
    st.round += 1;
    st.phase = 'DEAL';
    const deck = this.deckProvider ? this.deckProvider(st.round) : shuffle(FULL_DECK, this.rng);
    if (deck.length !== FULL_DECK.length) throw new Error('deck must contain exactly 17 cards');
    const n = st.config.seats;
    st.seats.forEach((s, i) => {
      s.privateCard = deck[i];
      s.roundStartBalance = s.balance;
      s.position = 0;
      s.cashflow = 0;
      s.trades = [];
      s.submission = null;
      s.quote = {};
      s.ready = false;
      s.hasActedThisCycle = false;
    });
    st.communityCards = deck.slice(n, n + st.config.communityCards);
    st.unusedCards = deck.slice(n + st.config.communityCards);
    st.revealedCount = 0;
    st.cycle = 0;
    st.pendingCounter = null;
    this.log({ type: 'ROUND_STARTED', round: st.round }, now);
    this.startCycle(now);
  }

  private startCycle(now: number) {
    const st = this.state;
    st.cycle += 1;
    st.phase = 'QUOTE_PREPARATION';
    st.turnSeat = null;
    st.pendingCounter = null;
    for (const s of st.seats) {
      s.submission = { confirmed: false };
      s.hasActedThisCycle = false;
      s.quote = {};
    }
    st.deadline = now + st.config.timers.quotePrepMs;
    st.phaseVersion += 1;
    this.log({ type: 'CYCLE_STARTED', round: st.round, cycle: st.cycle, firstSeat: st.cycleStartSeat }, now);
  }

  private publishQuotes(now: number) {
    const st = this.state;
    const published: Array<{ seat: number; bid?: number; ask?: number }> = [];
    for (const s of st.seats) {
      const sub = s.submission;
      s.quote = {};
      if (sub?.confirmed) {
        if (sub.bid !== undefined) s.quote.bid = sub.bid;
        if (sub.ask !== undefined) s.quote.ask = sub.ask;
      }
      published.push({ seat: s.index, ...s.quote });
      s.submission = null;
    }
    this.log({ type: 'QUOTES_PUBLISHED', quotes: published }, now);
    st.phase = 'TRADING';
    this.beginTurn(st.cycleStartSeat, now);
  }

  private beginTurn(seat: number, now: number) {
    const st = this.state;
    st.turnSeat = seat;
    st.deadline = now + st.config.timers.turnMs;
    st.phaseVersion += 1;
    this.log({ type: 'TURN_STARTED', seat }, now);
  }

  private advanceTurn(now: number) {
    const st = this.state;
    if (st.turnSeat !== null) st.seats[st.turnSeat].hasActedThisCycle = true;
    st.pendingCounter = null;
    const n = st.config.seats;
    for (let k = 0; k < n; k++) {
      const seat = (st.cycleStartSeat + k) % n;
      if (!st.seats[seat].hasActedThisCycle) {
        this.beginTurn(seat, now);
        return;
      }
    }
    this.endCycle(now);
  }

  private endCycle(now: number) {
    const st = this.state;
    // Expire ALL quotes before any new information is revealed.
    for (const s of st.seats) s.quote = {};
    this.log({ type: 'QUOTES_EXPIRED', cycle: st.cycle }, now);
    st.turnSeat = null;
    st.cycleStartSeat = (st.cycleStartSeat + 1) % st.config.seats;
    if (st.cycle < st.config.cyclesPerRound) {
      this.revealCommunity(now);
      this.startCycle(now);
    } else {
      this.settle(now);
    }
  }

  private revealCommunity(now: number) {
    const st = this.state;
    if (st.revealedCount >= st.communityCards.length) return;
    const index = st.revealedCount;
    st.revealedCount += 1;
    this.log({ type: 'COMMUNITY_REVEALED', index, card: st.communityCards[index] }, now);
  }

  private settle(now: number) {
    const st = this.state;
    st.phase = 'SETTLEMENT';
    while (st.revealedCount < st.communityCards.length) this.revealCommunity(now);
    const privateCards = st.seats.map((s) => s.privateCard!);
    const V = privateCards.reduce((a, b) => a + b, 0) + st.communityCards.reduce((a, b) => a + b, 0);
    const before = st.seats.reduce((a, s) => a + s.balance, 0);
    const result: RoundResult = {
      round: st.round,
      privateCards,
      communityCards: st.communityCards.slice(),
      settlementValue: V,
      seats: st.seats.map((s) => {
        const pnl = s.cashflow + s.position * V;
        const endBalance = s.roundStartBalance + pnl;
        return {
          seat: s.index,
          roundStartBalance: s.roundStartBalance,
          position: s.position,
          cashflow: s.cashflow,
          pnl,
          endBalance,
          trades: s.trades.slice(),
        };
      }),
    };
    for (const r of result.seats) {
      const s = st.seats[r.seat];
      s.balance = r.endBalance;
      if (s.balance < 0) throw new Error(`invariant violated: negative balance for seat ${s.index}`);
    }
    const after = st.seats.reduce((a, s) => a + s.balance, 0);
    if (after !== before) throw new Error(`invariant violated: total credits changed ${before} -> ${after}`);
    st.roundHistory.push(result);
    this.log({ type: 'SETTLED', result }, now);
    st.phase = 'ROUND_REVIEW';
    st.deadline = now + st.config.timers.reviewMs;
    st.phaseVersion += 1;
    for (const s of st.seats) s.ready = s.isBot;
    this.maybeFinishReview(now);
  }

  private maybeFinishReview(now: number) {
    const st = this.state;
    if (st.phase !== 'ROUND_REVIEW') return;
    if (st.seats.every((s) => s.ready)) this.nextRound(now);
  }

  private nextRound(now: number) {
    const st = this.state;
    st.deadline = null;
    for (const s of st.seats) {
      s.position = 0;
      s.cashflow = 0;
      s.quote = {};
    }
    if (st.round >= st.config.rounds) {
      st.phase = 'MATCH_COMPLETE';
      const max = Math.max(...st.seats.map((s) => s.balance));
      st.winners = st.seats.filter((s) => s.balance === max).map((s) => s.index);
      st.phaseVersion += 1;
      this.log({ type: 'MATCH_COMPLETE', winners: st.winners }, now);
      return;
    }
    this.startRound(now);
  }

  // ---------- timers ----------

  /** Apply any deadline that has passed. Returns true if state changed. */
  tick(now: number): boolean {
    const st = this.state;
    if (st.deadline === null || now < st.deadline) return false;
    switch (st.phase) {
      case 'QUOTE_PREPARATION':
        this.publishQuotes(now); // unconfirmed submissions produce no quote
        return true;
      case 'TRADING':
        if (st.pendingCounter) {
          this.log({ type: 'COUNTER_DECLINED', counterId: st.pendingCounter.id, reason: 'timeout' }, now);
          this.advanceTurn(now);
        } else if (st.turnSeat !== null) {
          this.log({ type: 'PASS', seat: st.turnSeat, reason: 'timeout' }, now);
          this.advanceTurn(now);
        }
        return true;
      case 'ROUND_REVIEW':
        this.nextRound(now);
        return true;
      default:
        st.deadline = null;
        return false;
    }
  }

  // ---------- commands ----------

  apply(seat: number, cmd: Command, now: number): CommandResult {
    const st = this.state;
    if (!Number.isInteger(seat) || seat < 0 || seat >= st.config.seats) return fail('invalid seat');
    switch (cmd.type) {
      case 'SUBMIT_QUOTE':
        return this.submitQuote(seat, cmd, now);
      case 'BUY':
        return this.takeQuote(seat, cmd.target, 'ask', cmd.price, now);
      case 'SELL':
        return this.takeQuote(seat, cmd.target, 'bid', cmd.price, now);
      case 'COUNTER':
        return this.counter(seat, cmd.target, cmd.side, cmd.price, now);
      case 'RESPOND_COUNTER':
        return this.respondCounter(seat, cmd.counterId, cmd.accept, now);
      case 'PASS':
        return this.pass(seat, now);
      case 'READY':
        return this.ready(seat, now);
      default:
        return fail('unknown command');
    }
  }

  private submitQuote(seat: number, cmd: { bid?: number; ask?: number; confirm: boolean }, now: number): CommandResult {
    const st = this.state;
    if (st.phase !== 'QUOTE_PREPARATION') return fail('quotes can only be prepared during quote preparation');
    const s = st.seats[seat];
    if (s.submission?.confirmed) return fail('your quote is already confirmed');
    const quote: QuoteSides = {};
    if (cmd.bid !== undefined && cmd.bid !== null) quote.bid = cmd.bid;
    if (cmd.ask !== undefined && cmd.ask !== null) quote.ask = cmd.ask;
    const priceError = validateQuotePrices(quote, this.bounds());
    if (priceError) return fail(priceError);
    const ev = evaluateQuote(this.portfolioOf(seat), quote, this.bounds(), st.config.positionLimit);
    if (!ev.ok) return fail(`quote not affordable ${ev.reason}`);
    s.submission = { ...quote, confirmed: cmd.confirm };
    st.version += 1;
    if (cmd.confirm) {
      this.log({ type: 'QUOTE_CONFIRMED', seat }, now);
      if (st.seats.every((x) => x.submission?.confirmed)) this.publishQuotes(now);
    }
    return OK;
  }

  private requireTurn(seat: number): string | null {
    const st = this.state;
    if (st.phase !== 'TRADING') return 'not in the trading phase';
    if (st.pendingCounter) return 'a counter-offer is awaiting a response';
    if (st.turnSeat !== seat) return 'it is not your turn';
    return null;
  }

  /** BUY takes an ask; SELL takes a bid. */
  private takeQuote(seat: number, target: number, side: Side, price: number, now: number): CommandResult {
    const st = this.state;
    const err = this.requireTurn(seat);
    if (err) return fail(err);
    if (!Number.isInteger(target) || target < 0 || target >= st.config.seats) return fail('invalid target seat');
    if (target === seat) return fail('you cannot trade with yourself');
    const quoted = st.seats[target].quote[side];
    if (quoted === undefined) return fail(`${st.seats[target].name} has no ${side} available`);
    if (quoted !== price) return fail(`that ${side} is now ${quoted}, not ${price}`);
    const buyer = side === 'ask' ? seat : target;
    const seller = side === 'ask' ? target : seat;
    const exec = this.executeTrade(buyer, seller, price, 'quote', seat, now);
    if (!exec.ok) return exec;
    delete st.seats[target].quote[side];
    this.trimQuotes([buyer, seller], now);
    this.advanceTurn(now);
    return OK;
  }

  private counter(seat: number, target: number, side: Side, price: number, now: number): CommandResult {
    const st = this.state;
    const err = this.requireTurn(seat);
    if (err) return fail(err);
    if (!Number.isInteger(target) || target < 0 || target >= st.config.seats) return fail('invalid target seat');
    if (target === seat) return fail('you cannot counter your own quote');
    if (side !== 'bid' && side !== 'ask') return fail('invalid side');
    const quoted = st.seats[target].quote[side];
    if (quoted === undefined) return fail(`${st.seats[target].name} has no ${side} to counter`);
    if (!Number.isInteger(price)) return fail('counter price must be a whole number');
    const b = this.bounds();
    if (price < b.L || price > b.U) return fail(`price ${price} is outside the possible range ${b.L} to ${b.U}`);
    if (side === 'ask' && price >= quoted) return fail(`a counter to an ask of ${quoted} must be strictly lower`);
    if (side === 'bid' && price <= quoted) return fail(`a counter to a bid of ${quoted} must be strictly higher`);
    const buyer = side === 'ask' ? seat : target;
    const seller = side === 'ask' ? target : seat;
    const check = this.checkExecution(buyer, seller, price);
    if (check) return fail(check);
    const pc: PendingCounter = { id: st.nextCounterId++, from: seat, target, side, quotedPrice: quoted, price };
    st.pendingCounter = pc;
    st.deadline = now + st.config.timers.counterMs;
    st.phaseVersion += 1;
    this.log({ type: 'COUNTER_PROPOSED', counter: pc }, now);
    return OK;
  }

  private respondCounter(seat: number, counterId: number, accept: boolean, now: number): CommandResult {
    const st = this.state;
    if (st.phase !== 'TRADING') return fail('not in the trading phase');
    const pc = st.pendingCounter;
    if (!pc || pc.id !== counterId) return fail('that counter-offer is no longer pending');
    if (pc.target !== seat) return fail('this counter-offer is not addressed to you');
    if (accept) {
      // Revalidate atomically: the quoted side must still exist and both portfolios must be safe.
      if (st.seats[pc.target].quote[pc.side] !== pc.quotedPrice) {
        this.log({ type: 'COUNTER_DECLINED', counterId, reason: 'manual' }, now);
        this.advanceTurn(now);
        return fail('your quoted side is no longer available; counter declined');
      }
      const buyer = pc.side === 'ask' ? pc.from : pc.target;
      const seller = pc.side === 'ask' ? pc.target : pc.from;
      const exec = this.executeTrade(buyer, seller, pc.price, 'counter', pc.from, now);
      if (!exec.ok) {
        this.log({ type: 'COUNTER_DECLINED', counterId, reason: 'manual' }, now);
        this.advanceTurn(now);
        return fail(`${exec.error}; counter declined`);
      }
      delete st.seats[pc.target].quote[pc.side];
      this.log({ type: 'COUNTER_ACCEPTED', counterId }, now);
      this.trimQuotes([buyer, seller], now);
    } else {
      this.log({ type: 'COUNTER_DECLINED', counterId, reason: 'manual' }, now);
    }
    this.advanceTurn(now);
    return OK;
  }

  private pass(seat: number, now: number): CommandResult {
    const err = this.requireTurn(seat);
    if (err) return fail(err);
    this.log({ type: 'PASS', seat, reason: 'manual' }, now);
    this.advanceTurn(now);
    return OK;
  }

  private ready(seat: number, now: number): CommandResult {
    const st = this.state;
    if (st.phase !== 'ROUND_REVIEW') return fail('not in round review');
    const s = st.seats[seat];
    if (s.ready) return OK;
    s.ready = true;
    this.log({ type: 'PLAYER_READY', seat }, now);
    this.maybeFinishReview(now);
    return OK;
  }

  // ---------- execution ----------

  private checkExecution(buyer: number, seller: number, price: number): string | null {
    const st = this.state;
    const b = this.bounds();
    const bp = checkPortfolio(applyBuy(this.portfolioOf(buyer), price), b, st.config.positionLimit);
    if (!bp.ok) return `${st.seats[buyer].name} cannot buy: ${bp.reason}`;
    const sp = checkPortfolio(applySell(this.portfolioOf(seller), price), b, st.config.positionLimit);
    if (!sp.ok) return `${st.seats[seller].name} cannot sell: ${sp.reason}`;
    return null;
  }

  private executeTrade(buyer: number, seller: number, price: number, via: 'quote' | 'counter', initiator: number, now: number): CommandResult {
    const st = this.state;
    const problem = this.checkExecution(buyer, seller, price);
    if (problem) return fail(problem);
    const b = this.bounds();
    const pub = this.publicCards();
    const bs = st.seats[buyer];
    const ss = st.seats[seller];
    bs.position += 1;
    bs.cashflow -= price;
    ss.position -= 1;
    ss.cashflow += price;
    const trade: Trade = { id: st.nextTradeId++, round: st.round, cycle: st.cycle, buyer, seller, price, via, initiator };
    const ctx = (own: number): TradeContext => ({ ownCard: own, publicCards: pub.slice(), bounds: b, cycle: st.cycle });
    bs.trades.push({ tradeId: trade.id, cycle: st.cycle, side: 'BUY', price, counterparty: seller, via, context: ctx(bs.privateCard!) });
    ss.trades.push({ tradeId: trade.id, cycle: st.cycle, side: 'SELL', price, counterparty: buyer, via, context: ctx(ss.privateCard!) });
    this.log({ type: 'TRADE', trade }, now);
    return OK;
  }

  /** Cancel quote sides that became unsafe after a position change, logging each cancellation. */
  private trimQuotes(seats: number[], now: number) {
    const st = this.state;
    const b = this.bounds();
    for (const seat of seats) {
      const s = st.seats[seat];
      const { quote, cancellations } = trimQuote(this.portfolioOf(seat), s.quote, b, st.config.positionLimit);
      s.quote = quote;
      for (const c of cancellations) this.log({ type: 'QUOTE_CANCELLED', seat, cancellation: c }, now);
    }
  }

  // ---------- logging ----------

  private log(event: GameEvent, at: number) {
    const st = this.state;
    st.version += 1;
    st.events.push({ seq: st.events.length + 1, round: st.round, cycle: st.cycle, at, event });
  }
}
