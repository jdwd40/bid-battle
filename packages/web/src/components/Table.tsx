import { useEffect, useState } from 'react';
import { applyBuy, applyRiskCancellation, applySell, checkPortfolio, evaluateQuote, type PlayerView, type QuoteSides, type SeatView } from '@bid-battle/engine';
import type { ClientView } from '../../../server/src/protocol';
import { difficultyLabel, fmt, fmtPosition, phaseLabel, revealLabel, SIDE_TEXT } from '../format';
import { coachTip, myFairEstimate } from '../coach';
import { ActivityFeed } from './ActivityFeed';
import { Card } from './Card';
import { Countdown } from './Countdown';
import { HelpPanel } from './HelpPanel';
import { QuotePanel } from './QuotePanel';
import { seatStatus } from './seatStatus';
import { Stats } from './Stats';
import { TablePhone } from './TablePhone';
import { ActionButtons, ActionDetail, PreviewBox } from './TradeActions';
import { useTradeActions, type OnCommand } from './useTradeActions';
import { usePhoneLayout } from '../usePhoneLayout';

interface Props {
  view: ClientView;
  game: PlayerView;
  offset: number;
  error: string | null;
  onCommand: OnCommand;
}

const TIMER_TOTALS = { QUOTE_PREPARATION: 20_000, TURN: 20_000, COUNTER: 10_000 };

/** The game table. Phones get their own layout (see TablePhone.tsx); both share the status bar, errors and counter-offer modal. */
export function Table({ view, game, offset, error, onCommand }: Props) {
  const me = game.seat!;
  const mySeat = game.seats[me];
  const prep = game.phase === 'QUOTE_PREPARATION';
  const pending = game.pendingCounter;

  const timerLabel = prep ? 'Confirm your quote' : pending ? 'Counter-offer response' : game.turnSeat === me ? 'Your turn' : `${game.seats[game.turnSeat ?? 0]?.name ?? ''}'s turn`;
  const timerTotal = prep ? TIMER_TOTALS.QUOTE_PREPARATION : pending ? TIMER_TOTALS.COUNTER : TIMER_TOTALS.TURN;
  const estimate = myFairEstimate(game);
  const phone = usePhoneLayout();

  // On a phone the quote form sits near the top, so each quote preparation (including the first, after
  // tapping Start further down the lobby) starts scrolled to the top with the whole form in view.
  const prepKey = prep ? `${game.round}-${game.cycle}` : null;
  useEffect(() => {
    if (phone && prepKey !== null) window.scrollTo(0, 0);
  }, [phone, prepKey]);

  const statusBar = (
    // On phones this header is the sticky status bar (see styles.css).
    <div className="table-head" data-testid="status-bar">
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
          Public range {fmt(game.publicRange.L)} to {fmt(game.publicRange.U)}
        </span>
        {estimate !== null && (
          <span className="fair-estimate" data-testid="fair-estimate" title="Your fair estimate of the settlement value">
            Fair estimate <strong>{Math.round(estimate)}</strong>
          </span>
        )}
      </div>
      <Countdown deadline={game.deadline} offset={offset} totalMs={timerTotal} label={timerLabel} />
    </div>
  );
  const errorBox = error && (
    <div className="error" role="alert" data-testid="error">
      {error}
    </div>
  );
  const counterModal = pending && pending.target === me && <CounterModal game={game} offset={offset} onCommand={onCommand} />;

  if (phone) return <TablePhone view={view} game={game} statusBar={statusBar} errorBox={errorBox} counterModal={counterModal} onCommand={onCommand} />;

  return (
    <div className="stack">
      {statusBar}

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
                <span>{revealLabel(game, i)}</span>
              </div>
            ))}
          </div>

          <div className="panel my-hand">
            <div className="stack" style={{ alignItems: 'center' }}>
              <Card value={mySeat.privateCard} size="lg" label="Your private card" />
              <span className="muted small">Your private card</span>
            </div>
            <div className="stat-grid">
              <Stats game={game} keys={['balance', 'position', 'cashflow', 'reserved', 'available']} />
            </div>
          </div>

          {errorBox}

          <CoachBox game={game} />

          {prep ? <QuotePanel game={game} onCommand={onCommand} /> : <ActionPanel game={game} onCommand={onCommand} />}
        </div>

        <div className="table-side">
          <ActivityFeed events={game.events} seats={game.seats} />
          <HelpPanel />
        </div>
      </div>

      {counterModal}
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

// ---------------- seats ----------------

const PROGRESS_LABEL = { preparing: 'Preparing…', confirmed: 'Quote confirmed', acted: 'Acted' } as const;

function SeatTile({ seat, game, view, isMe }: { seat: SeatView; game: PlayerView; view: ClientView; isMe: boolean }) {
  const { active, takenOver, progress } = seatStatus(seat, game, view);
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
        {seat.isBot ? <span className="pill bot">Bot · {difficultyLabel(seat.difficulty)}</span> : <span className="pill player">Player</span>}
        {takenOver && <span className="pill warn" data-testid={`takeover-${seat.index}`}>Takeover: bot playing until they reconnect</span>}
        <span className="pill">{fmtPosition(seat.position)}</span>
        {progress && <span className="pill">{PROGRESS_LABEL[progress]}</span>}
      </div>
      {game.phase === 'TRADING' && (
        <div className="quote-line">
          {(['bid', 'ask'] as const).map((side) => (
            <div className={`quote-box ${side} ${seat.quote[side] === undefined ? 'empty' : ''}`} key={side}>
              {SIDE_TEXT[side].label} — {SIDE_TEXT[side].verb}s at
              <strong data-testid={`${side}-${seat.index}`}>{seat.quote[side] === undefined ? '—' : fmt(seat.quote[side])}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- trading actions ----------------

function ActionPanel({ game, onCommand }: { game: PlayerView; onCommand: OnCommand }) {
  const a = useTradeActions(game, onCommand);
  const { mode, levels, isMyTurn, waitingOn, buyReason, sellReason } = a;

  return (
    <div className="panel stack action-panel" data-testid="action-panel">
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
            <ActionButtons actions={a} />
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

      <ActionDetail game={game} actions={a} cancelLabel="Back" />
    </div>
  );
}

// ---------------- counter response ----------------

function CounterModal({ game, offset, onCommand }: { game: PlayerView; offset: number; onCommand: OnCommand }) {
  const pc = game.pendingCounter!;
  const local = game.me!;
  const [busy, setBusy] = useState(false);
  const from = game.seats[pc.from].name;
  const iSell = pc.side === 'ask';
  const p = iSell ? applySell(local.portfolio, pc.price) : applyBuy(local.portfolio, pc.price);
  const check = checkPortfolio(p, game.publicRange, game.positionLimit);
  const rest: QuoteSides = { ...game.seats[game.seat!].quote };
  delete rest[pc.side];
  const afterCancellation = applyRiskCancellation(p, rest, game.publicRange, game.positionLimit);
  const ev = evaluateQuote(p, afterCancellation.quote, game.publicRange, game.positionLimit);
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
        <PreviewBox label="If you accept" preview={{ ok: check.ok, reason: check.reason, portfolio: p, reserved: ev.reserved, cancellations: afterCancellation.cancellations }} />
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
