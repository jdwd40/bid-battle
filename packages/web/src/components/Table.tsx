import { useEffect, useMemo, useState } from 'react';
import {
  applyBuy,
  applySell,
  checkPortfolio,
  evaluateQuote,
  trimQuote,
  validateQuotePrices,
  type Command,
  type CommandResult,
  type PlayerView,
  type QuoteSides,
  type SeatView,
  type Side,
} from '@bid-battle/engine';
import type { ClientView } from '../../../server/src/protocol';
import { difficultyLabel, fmt, fmtPosition, fmtSigned, phaseLabel } from '../format';
import { coachTip, guessLine, roughGuess, suggestedQuote } from '../coach';
import { ActivityFeed } from './ActivityFeed';
import { Card } from './Card';
import { Countdown } from './Countdown';
import { HelpPanel } from './HelpPanel';

interface Props {
  view: ClientView;
  game: PlayerView;
  offset: number;
  error: string | null;
  onCommand(cmd: Command): Promise<CommandResult>;
}

const TIMER_TOTALS = { QUOTE_PREPARATION: 20_000, TURN: 20_000, COUNTER: 10_000 };

export function Table({ view, game, offset, error, onCommand }: Props) {
  const me = game.seat!;
  const mySeat = game.seats[me];
  const local = game.me!;
  const prep = game.phase === 'QUOTE_PREPARATION';
  const pending = game.pendingCounter;

  const timerLabel = prep ? 'Lock in your quote' : pending ? 'Counter-offer response' : game.turnSeat === me ? 'Your turn' : `${game.seats[game.turnSeat ?? 0]?.name ?? ''}'s turn`;
  const timerTotal = prep ? TIMER_TOTALS.QUOTE_PREPARATION : pending ? TIMER_TOTALS.COUNTER : TIMER_TOTALS.TURN;

  return (
    <div className="stack">
      <div className="table-head">
        <div className="meta">
          <strong>
            Round {game.round}/{game.totalRounds}
          </strong>
          <span>
            Cycle {game.cycle}/{game.cyclesPerRound}
          </span>
          <span className="pill" data-testid="phase">
            {phaseLabel(game.phase)}
          </span>
          <span className="muted small">
            Possible value {fmt(game.bounds.L)} to {fmt(game.bounds.U)}
          </span>
        </div>
        <Countdown deadline={game.deadline} offset={offset} totalMs={timerTotal} label={timerLabel} />
      </div>

      <div className="table-grid">
        <div className="table-main">
          <div className="seats">
            {game.seats.map((s) => (
              <SeatTile key={s.index} seat={s} game={game} view={view} isMe={s.index === me} />
            ))}
          </div>

          <div className="community" data-testid="community">
            {game.communityCards.map((c, i) => (
              <div className="slot" key={i}>
                <Card value={c} label={`Community ${i + 1}`} />
                <span>{c === null ? (i === game.cyclesPerRound - 1 ? 'Settlement' : `Cycle ${i + 2}`) : 'Revealed'}</span>
              </div>
            ))}
          </div>

          <div className="panel my-hand">
            <div className="stack" style={{ alignItems: 'center' }}>
              <Card value={mySeat.privateCard} size="lg" label="Your private card" />
              <span className="muted small">Your private card</span>
            </div>
            <div className="stat-grid">
              <Stat label="Balance" value={`${mySeat.balance}`} testId="balance" />
              <Stat label="Position" value={fmtPosition(local.portfolio.q)} testId="position" />
              <Stat label="Cashflow" value={fmtSigned(local.portfolio.C)} />
              <Stat label="Reserved risk" value={`${local.reserved}`} testId="reserved" />
              <Stat label="Available" value={`${local.available}`} testId="available" />
            </div>
          </div>

          {error && (
            <div className="error" role="alert" data-testid="error">
              {error}
            </div>
          )}

          <CoachBox game={game} />

          {prep ? <QuotePanel game={game} onCommand={onCommand} /> : <ActionPanel game={game} onCommand={onCommand} />}
        </div>

        <div className="table-side">
          <ActivityFeed events={game.events} seats={game.seats} />
          <HelpPanel />
        </div>
      </div>

      {pending && pending.target === me && <CounterModal game={game} offset={offset} onCommand={onCommand} />}
    </div>
  );
}

function CoachBox({ game }: { game: PlayerView }) {
  const [open, setOpen] = useState(true);
  const tip = coachTip(game);
  if (!tip.title) return null;
  return (
    <div className="coach" data-testid="coach">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{tip.title}</strong>
        <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide tip' : 'Show tip'}
        </button>
      </div>
      {open && <p>{tip.body}</p>}
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

// ---------------- seats ----------------

function SeatTile({ seat, game, view, isMe }: { seat: SeatView; game: PlayerView; view: ClientView; isMe: boolean }) {
  const active = game.phase === 'TRADING' && game.turnSeat === seat.index;
  const aiControlled = view.aiControlled[seat.index] && !seat.isBot;
  const trading = game.phase === 'TRADING';
  return (
    <div className={`seat ${active ? 'active' : ''} ${isMe ? 'me' : ''}`} data-testid={`seat-${seat.index}`} aria-current={active ? 'true' : undefined}>
      {active && <span className="turn-tag">Acting</span>}
      <div className="seat-top">
        <span className="seat-name">
          {seat.name}
          {isMe ? ' (you)' : ''}
        </span>
        <span className="num" title="Balance">
          {seat.balance} cr
        </span>
      </div>
      <div className="seat-status">
        {seat.isBot ? <span className="pill ai">AI · {difficultyLabel(seat.difficulty)}</span> : <span className="pill human">Human</span>}
        {aiControlled && <span className="pill warn">AI playing (disconnected)</span>}
        <span className="pill">{fmtPosition(seat.position)}</span>
        {game.phase === 'QUOTE_PREPARATION' && <span className="pill">{seat.submissionConfirmed ? 'Quote locked' : 'Preparing…'}</span>}
        {trading && seat.hasActedThisCycle && !active && <span className="pill">Acted</span>}
      </div>
      {trading && (
        <div className="quote-line">
          <div className={`quote-box bid ${seat.quote.bid === undefined ? 'empty' : ''}`}>
            Bid — buys at
            <strong data-testid={`bid-${seat.index}`}>{seat.quote.bid === undefined ? '—' : fmt(seat.quote.bid)}</strong>
          </div>
          <div className={`quote-box ask ${seat.quote.ask === undefined ? 'empty' : ''}`}>
            Ask — sells at
            <strong data-testid={`ask-${seat.index}`}>{seat.quote.ask === undefined ? '—' : fmt(seat.quote.ask)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- quote preparation ----------------

function QuotePanel({ game, onCommand }: { game: PlayerView; onCommand: Props['onCommand'] }) {
  const local = game.me!;
  const sub = local.submission;
  const suggestion = suggestedQuote(game);
  const hasDraft = Boolean(sub && (sub.bid !== undefined || sub.ask !== undefined));
  const [useBid, setUseBid] = useState(hasDraft ? sub!.bid !== undefined : true);
  const [useAsk, setUseAsk] = useState(hasDraft ? sub!.ask !== undefined : true);
  const [bid, setBid] = useState<string>(hasDraft && sub!.bid !== undefined ? String(sub!.bid) : suggestion ? String(suggestion.bid) : '');
  const [ask, setAsk] = useState<string>(hasDraft && sub!.ask !== undefined ? String(sub!.ask) : suggestion ? String(suggestion.ask) : '');
  const [busy, setBusy] = useState(false);

  // Reset the form with fresh suggestions when a new cycle begins.
  const cycleKey = `${game.round}-${game.cycle}`;
  useEffect(() => {
    if (!hasDraft) {
      setUseBid(true);
      setUseAsk(true);
      setBid(suggestion ? String(suggestion.bid) : '');
      setAsk(suggestion ? String(suggestion.ask) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey]);

  const quote: QuoteSides = {};
  const bidNum = Number(bid);
  const askNum = Number(ask);
  if (useBid && bid.trim() !== '' && Number.isFinite(bidNum)) quote.bid = bidNum;
  if (useAsk && ask.trim() !== '' && Number.isFinite(askNum)) quote.ask = askNum;
  const incomplete = (useBid && quote.bid === undefined) || (useAsk && quote.ask === undefined);
  const priceError = incomplete ? 'enter a whole-number price for each side you are posting' : validateQuotePrices(quote, game.bounds);
  const ev = priceError ? null : evaluateQuote(local.portfolio, quote, game.bounds, game.positionLimit);
  const problem = priceError ?? (ev && !ev.ok ? `not affordable ${ev.reason}` : null);
  const confirmed = Boolean(sub?.confirmed);
  const posting = useBid || useAsk;
  const guess = roughGuess(game);

  const lock = async (skip = false) => {
    setBusy(true);
    await onCommand(skip ? { type: 'SUBMIT_QUOTE', confirm: true } : { type: 'SUBMIT_QUOTE', ...quote, confirm: true });
    setBusy(false);
  };
  const step = (setter: (v: string) => void, current: string, delta: number) => {
    const n = current.trim() === '' ? (guess !== null ? Math.round(guess) : 0) : Number(current);
    setter(String(Math.max(game.bounds.L, Math.min(game.bounds.U, n + delta))));
  };

  if (confirmed) {
    return (
      <div className="panel stack" data-testid="quote-panel">
        <h2>Your sealed quote is locked</h2>
        <div className="best-levels">
          <div className="best bid">
            <div className="label">Bid — I buy at</div>
            <div className="price">{sub?.bid === undefined ? '—' : fmt(sub.bid)}</div>
          </div>
          <div className="best ask">
            <div className="label">Ask — I sell at</div>
            <div className="price">{sub?.ask === undefined ? '—' : fmt(sub.ask)}</div>
          </div>
        </div>
        <div className="hint">
          {sub?.bid === undefined && sub?.ask === undefined ? 'You are posting no prices this cycle. ' : ''}
          Reserved risk {local.reserved} · available {local.available}. Everyone's prices are revealed together once all traders have locked in or the timer ends.
        </div>
      </div>
    );
  }

  return (
    <div className="panel stack" data-testid="quote-panel">
      <h2>Set your two prices</h2>
      <div className="hint">
        <strong>Bid</strong> = the price you would <strong>pay to buy</strong> one contract. <strong>Ask</strong> = the price you would{' '}
        <strong>sell</strong> one for. Keep your bid below your guess and your ask above it. {guess !== null && guessLine(game)}
      </div>
      <div className="quote-form">
        <div className="side bid">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h4>Bid — I buy at</h4>
            <button type="button" className={`toggle ${useBid ? 'on' : ''}`} aria-pressed={useBid} onClick={() => setUseBid((v) => !v)} data-testid="use-bid">
              {useBid ? 'Posting' : 'Not posting'}
            </button>
          </div>
          {useBid ? (
            <div className="stepper">
              <button type="button" className="btn btn-sm" onClick={() => step(setBid, bid, -1)} aria-label="Lower bid by one">
                −1
              </button>
              <input className="input input-num" type="number" step={1} value={bid} onChange={(e) => setBid(e.target.value)} aria-label="Bid price" data-testid="bid-input" />
              <button type="button" className="btn btn-sm" onClick={() => step(setBid, bid, 1)} aria-label="Raise bid by one">
                +1
              </button>
            </div>
          ) : (
            <div className="muted small">You will not offer to buy this cycle.</div>
          )}
          <div className="muted small">Lower bid = less likely to trade, but more profit if someone sells to you.</div>
        </div>
        <div className="side ask">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h4>Ask — I sell at</h4>
            <button type="button" className={`toggle ${useAsk ? 'on' : ''}`} aria-pressed={useAsk} onClick={() => setUseAsk((v) => !v)} data-testid="use-ask">
              {useAsk ? 'Posting' : 'Not posting'}
            </button>
          </div>
          {useAsk ? (
            <div className="stepper">
              <button type="button" className="btn btn-sm" onClick={() => step(setAsk, ask, -1)} aria-label="Lower ask by one">
                −1
              </button>
              <input className="input input-num" type="number" step={1} value={ask} onChange={(e) => setAsk(e.target.value)} aria-label="Ask price" data-testid="ask-input" />
              <button type="button" className="btn btn-sm" onClick={() => step(setAsk, ask, 1)} aria-label="Raise ask by one">
                +1
              </button>
            </div>
          ) : (
            <div className="muted small">You will not offer to sell this cycle.</div>
          )}
          <div className="muted small">Higher ask = less likely to trade, but more profit if someone buys from you.</div>
        </div>
      </div>
      {posting && problem ? (
        <div className="hint" role="status">
          Cannot post yet: {problem}. Prices must be whole numbers between {fmt(game.bounds.L)} and {fmt(game.bounds.U)}, with the bid below the ask.
        </div>
      ) : posting ? (
        <div className="preview" role="status">
          {quote.bid !== undefined && quote.ask !== undefined ? `Your spread is ${quote.ask - quote.bid} points. ` : ''}
          If your prices get traded against, the most you could lose is <strong>{ev!.reserved}</strong> of your {local.portfolio.B} credits
          {ev!.worstSubset.length > 0 && <span className="muted"> (worst case: your {ev!.worstSubset.join(' and ')} filled)</span>}.
        </div>
      ) : (
        <div className="hint" role="status">
          You are not posting any prices. You can still buy or sell against other traders' prices on your turn.
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary" disabled={busy || (posting && Boolean(problem))} onClick={() => lock(false)} data-testid="lock-quote">
          {posting ? 'Lock in my prices' : 'Lock in: no prices'}
        </button>
        {suggestion && (
          <button
            className="btn"
            onClick={() => {
              setUseBid(true);
              setUseAsk(true);
              setBid(String(suggestion.bid));
              setAsk(String(suggestion.ask));
            }}
            data-testid="suggest-quote"
          >
            Use suggested ({fmt(suggestion.bid)} / {fmt(suggestion.ask)})
          </button>
        )}
        <button className="btn" disabled={busy} onClick={() => lock(true)} data-testid="skip-quote">
          Skip this cycle
        </button>
        <span className="muted small">
          {game.seats.filter((s) => s.submissionConfirmed).length}/{game.seats.length} traders locked in
        </span>
      </div>
    </div>
  );
}

// ---------------- trading actions ----------------

type Mode = { kind: 'idle' } | { kind: 'buy'; target: number; price: number } | { kind: 'sell'; target: number; price: number } | { kind: 'counter' };

function ActionPanel({ game, onCommand }: { game: PlayerView; onCommand: Props['onCommand'] }) {
  const me = game.seat!;
  const local = game.me!;
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [counterTarget, setCounterTarget] = useState<string>('');
  const [counterPrice, setCounterPrice] = useState<string>('');

  useEffect(() => {
    setMode({ kind: 'idle' });
  }, [game.phaseVersion]);

  const myQuote = game.seats[me].quote;
  const levels = useMemo(() => {
    const asks = game.seats.filter((s) => s.index !== me && s.quote.ask !== undefined).map((s) => ({ seat: s.index, price: s.quote.ask! }));
    const bids = game.seats.filter((s) => s.index !== me && s.quote.bid !== undefined).map((s) => ({ seat: s.index, price: s.quote.bid! }));
    asks.sort((a, b) => a.price - b.price || a.seat - b.seat);
    bids.sort((a, b) => b.price - a.price || a.seat - b.seat);
    return { asks, bids, bestAsk: asks[0] ?? null, bestBid: bids[0] ?? null };
  }, [game.seats, me]);

  const isMyTurn = game.phase === 'TRADING' && game.turnSeat === me && !game.pendingCounter;
  const waitingOn = game.pendingCounter
    ? game.pendingCounter.from === me
      ? `Waiting for ${game.seats[game.pendingCounter.target].name} to answer your counter-offer`
      : `Waiting for ${game.seats[game.pendingCounter.target].name} to answer a counter-offer`
    : game.turnSeat !== null && game.turnSeat !== me
      ? `Waiting for ${game.seats[game.turnSeat].name} to act`
      : null;

  const preview = (side: 'buy' | 'sell', price: number) => {
    const p = side === 'buy' ? applyBuy(local.portfolio, price) : applySell(local.portfolio, price);
    const check = checkPortfolio(p, game.bounds, game.positionLimit);
    const trimmed = trimQuote(p, myQuote, game.bounds, game.positionLimit);
    const ev = evaluateQuote(p, trimmed.quote, game.bounds, game.positionLimit);
    return { ok: check.ok, reason: check.reason, portfolio: p, reserved: ev.reserved, cancellations: trimmed.cancellations };
  };

  const buyReason = !isMyTurn ? waitingOn ?? 'Not your turn' : !levels.bestAsk ? 'No one is offering to sell right now' : preview('buy', levels.bestAsk.price).ok ? null : `You cannot buy: ${preview('buy', levels.bestAsk.price).reason}`;
  const sellReason = !isMyTurn ? waitingOn ?? 'Not your turn' : !levels.bestBid ? 'No one is offering to buy right now' : preview('sell', levels.bestBid.price).ok ? null : `You cannot sell: ${preview('sell', levels.bestBid.price).reason}`;
  const counterReason = !isMyTurn ? waitingOn ?? 'Not your turn' : levels.asks.length + levels.bids.length === 0 ? 'No quotes to counter' : null;

  const run = async (cmd: Command) => {
    setBusy(true);
    const res = await onCommand(cmd);
    setBusy(false);
    if (res.ok) setMode({ kind: 'idle' });
  };

  const counterOptions = [
    ...levels.asks.map((a) => ({ key: `ask:${a.seat}`, side: 'ask' as Side, seat: a.seat, price: a.price, label: `Buy below ${game.seats[a.seat].name}'s ask ${fmt(a.price)}` })),
    ...levels.bids.map((b) => ({ key: `bid:${b.seat}`, side: 'bid' as Side, seat: b.seat, price: b.price, label: `Sell above ${game.seats[b.seat].name}'s bid ${fmt(b.price)}` })),
  ];
  const chosen = counterOptions.find((o) => o.key === counterTarget) ?? counterOptions[0] ?? null;
  const counterNum = Number(counterPrice);
  let counterProblem: string | null = null;
  if (chosen) {
    if (counterPrice.trim() === '' || !Number.isInteger(counterNum)) counterProblem = 'enter a whole-number price';
    else if (counterNum < game.bounds.L || counterNum > game.bounds.U) counterProblem = `price must be between ${fmt(game.bounds.L)} and ${fmt(game.bounds.U)}`;
    else if (chosen.side === 'ask' && counterNum >= chosen.price) counterProblem = `must be strictly below the ask of ${fmt(chosen.price)}`;
    else if (chosen.side === 'bid' && counterNum <= chosen.price) counterProblem = `must be strictly above the bid of ${fmt(chosen.price)}`;
    else {
      const pv = preview(chosen.side === 'ask' ? 'buy' : 'sell', counterNum);
      if (!pv.ok) counterProblem = pv.reason ?? 'risk limit';
    }
  }

  return (
    <div className="panel stack" data-testid="action-panel">
      <h2>{isMyTurn ? 'Your move' : 'Prices on the table'}</h2>
      <div className="best-levels">
        <div className="best bid">
          <div className="label">Best bid (someone buys at)</div>
          <div className="price" data-testid="best-bid">
            {levels.bestBid ? fmt(levels.bestBid.price) : '—'}
          </div>
          <div className="muted small">{levels.bestBid ? `${game.seats[levels.bestBid.seat].name} · you could sell here` : 'no bids from others'}</div>
        </div>
        <div className="best ask">
          <div className="label">Best ask (someone sells at)</div>
          <div className="price" data-testid="best-ask">
            {levels.bestAsk ? fmt(levels.bestAsk.price) : '—'}
          </div>
          <div className="muted small">{levels.bestAsk ? `${game.seats[levels.bestAsk.seat].name} · you could buy here` : 'no asks from others'}</div>
        </div>
      </div>

      {mode.kind === 'idle' && (
        <>
          <div className="actions">
            <button
              className="btn btn-buy"
              disabled={busy || Boolean(buyReason)}
              title={buyReason ?? undefined}
              onClick={() => levels.bestAsk && setMode({ kind: 'buy', target: levels.bestAsk.seat, price: levels.bestAsk.price })}
              data-testid="buy"
            >
              Buy {levels.bestAsk ? `at ${fmt(levels.bestAsk.price)}` : ''}
            </button>
            <button
              className="btn btn-sell"
              disabled={busy || Boolean(sellReason)}
              title={sellReason ?? undefined}
              onClick={() => levels.bestBid && setMode({ kind: 'sell', target: levels.bestBid.seat, price: levels.bestBid.price })}
              data-testid="sell"
            >
              Sell {levels.bestBid ? `at ${fmt(levels.bestBid.price)}` : ''}
            </button>
            <button className="btn" disabled={busy || Boolean(counterReason)} title={counterReason ?? undefined} onClick={() => setMode({ kind: 'counter' })} data-testid="counter">
              Counter-offer
            </button>
            <button className="btn" disabled={busy || !isMyTurn} title={!isMyTurn ? waitingOn ?? 'Not your turn' : undefined} onClick={() => run({ type: 'PASS' })} data-testid="pass">
              Pass
            </button>
          </div>
          <div className="hint" data-testid="action-hint">
            {isMyTurn
              ? [buyReason, sellReason].filter(Boolean).length
                ? [buyReason, sellReason].filter(Boolean).join(' · ')
                : 'Take the best price, propose your own, or pass. Your own posted quotes stay live either way.'
              : waitingOn ?? 'Trading has not started.'}
          </div>
        </>
      )}

      {(mode.kind === 'buy' || mode.kind === 'sell') && (
        <TradeConfirm
          kind={mode.kind}
          target={game.seats[mode.target].name}
          price={mode.price}
          preview={preview(mode.kind, mode.price)}
          busy={busy}
          onCancel={() => setMode({ kind: 'idle' })}
          onConfirm={() => run(mode.kind === 'buy' ? { type: 'BUY', target: mode.target, price: mode.price } : { type: 'SELL', target: mode.target, price: mode.price })}
        />
      )}

      {mode.kind === 'counter' && chosen && (
        <div className="stack">
          <label className="field">
            Counter against
            <select className="input" value={chosen.key} onChange={(e) => setCounterTarget(e.target.value)} data-testid="counter-target">
              {counterOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Your price ({chosen.side === 'ask' ? 'you would buy' : 'you would sell'} one contract)
            <input className="input input-num" type="number" step={1} value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} data-testid="counter-price" />
          </label>
          {counterProblem ? (
            <div className="hint">Cannot send: {counterProblem}.</div>
          ) : (
            <PreviewBox label={`If ${game.seats[chosen.seat].name} accepts`} preview={preview(chosen.side === 'ask' ? 'buy' : 'sell', counterNum)} />
          )}
          <div className="row">
            <button className="btn btn-primary" disabled={busy || Boolean(counterProblem)} onClick={() => run({ type: 'COUNTER', target: chosen.seat, side: chosen.side, price: counterNum })} data-testid="send-counter">
              Send counter-offer
            </button>
            <button className="btn" onClick={() => setMode({ kind: 'idle' })}>
              Back
            </button>
          </div>
          <div className="muted small">They have 10 seconds to accept or decline. Either way this uses your action for the cycle.</div>
        </div>
      )}
    </div>
  );
}

type Preview = ReturnType<typeof previewShape>;
function previewShape() {
  return { ok: true as boolean, reason: undefined as string | undefined, portfolio: { B: 0, q: 0, C: 0 }, reserved: 0, cancellations: [] as Array<{ side: Side; price: number; reason: string }> };
}

function PreviewBox({ label, preview }: { label: string; preview: Preview }) {
  return (
    <div className="preview" data-testid="trade-preview">
      <strong>{label}:</strong> position {fmtPosition(preview.portfolio.q)} · cashflow {fmtSigned(preview.portfolio.C)} · reserved risk {preview.reserved} · available{' '}
      {preview.portfolio.B - preview.reserved}
      {preview.cancellations.length > 0 && (
        <ul>
          {preview.cancellations.map((c, i) => (
            <li key={i}>
              Your {c.side} at {fmt(c.price)} would be cancelled automatically ({c.reason}).
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TradeConfirm({ kind, target, price, preview, busy, onCancel, onConfirm }: { kind: 'buy' | 'sell'; target: string; price: number; preview: Preview; busy: boolean; onCancel(): void; onConfirm(): void }) {
  return (
    <div className="stack" data-testid="trade-confirm">
      <div>
        {kind === 'buy' ? 'Buy one contract from' : 'Sell one contract to'} <strong>{target}</strong> at <strong>{fmt(price)}</strong>.
      </div>
      <PreviewBox label="After this trade" preview={preview} />
      <div className="row">
        <button className={`btn ${kind === 'buy' ? 'btn-buy' : 'btn-sell'}`} disabled={busy || !preview.ok} onClick={onConfirm} data-testid="confirm-trade">
          Confirm {kind}
        </button>
        <button className="btn" onClick={onCancel}>
          Back
        </button>
      </div>
    </div>
  );
}

// ---------------- counter response ----------------

function CounterModal({ game, offset, onCommand }: { game: PlayerView; offset: number; onCommand: Props['onCommand'] }) {
  const pc = game.pendingCounter!;
  const local = game.me!;
  const [busy, setBusy] = useState(false);
  const from = game.seats[pc.from].name;
  const iSell = pc.side === 'ask';
  const p = iSell ? applySell(local.portfolio, pc.price) : applyBuy(local.portfolio, pc.price);
  const check = checkPortfolio(p, game.bounds, game.positionLimit);
  const rest: QuoteSides = { ...game.seats[game.seat!].quote };
  delete rest[pc.side];
  const trimmed = trimQuote(p, rest, game.bounds, game.positionLimit);
  const ev = evaluateQuote(p, trimmed.quote, game.bounds, game.positionLimit);
  const respond = async (accept: boolean) => {
    setBusy(true);
    await onCommand({ type: 'RESPOND_COUNTER', counterId: pc.id, accept });
    setBusy(false);
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="counter-title">
      <div className="modal stack" data-testid="counter-modal">
        <h2 id="counter-title">Counter-offer from {from}</h2>
        <p>
          {iSell ? (
            <>
              {from} wants to <strong>buy</strong> one contract from you at <strong>{fmt(pc.price)}</strong> instead of your ask of {fmt(pc.quotedPrice)}.
            </>
          ) : (
            <>
              {from} wants to <strong>sell</strong> you one contract at <strong>{fmt(pc.price)}</strong> instead of your bid of {fmt(pc.quotedPrice)}.
            </>
          )}
        </p>
        <PreviewBox label="If you accept" preview={{ ok: check.ok, reason: check.reason, portfolio: p, reserved: ev.reserved, cancellations: trimmed.cancellations }} />
        {!check.ok && <div className="hint">You cannot accept: {check.reason}.</div>}
        <Countdown deadline={game.deadline} offset={offset} totalMs={TIMER_TOTALS.COUNTER} label="Respond within" />
        <div className="row">
          <button className="btn btn-primary" disabled={busy || !check.ok} onClick={() => respond(true)} data-testid="accept-counter" autoFocus>
            Accept
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={() => respond(false)} data-testid="decline-counter">
            Decline (keep my quote)
          </button>
        </div>
      </div>
    </div>
  );
}
