import { useState, type ReactNode } from 'react';
import type { PlayerView, SeatView, Side } from '@bid-battle/engine';
import type { ClientView } from '../../../server/src/protocol';
import { coachTip } from '../coach';
import { difficultyLabel, fmt, fmtPosition, revealLabel, SIDE_TEXT } from '../format';
import { ActivityFeed } from './ActivityFeed';
import { Card } from './Card';
import { HelpPanel } from './HelpPanel';
import { QuotePanel } from './QuotePanel';
import { seatStatus } from './seatStatus';
import { Stats } from './Stats';
import { ActionButtons, ActionDetail } from './TradeActions';
import { useTradeActions, type OnCommand } from './useTradeActions';

/**
 * The phone table: status bar and card strip, then during quote preparation the quote form (errors directly
 * above its Confirm) before the trader rows, and during trading the trader rows before the action area.
 * Collapsible coach, activity and help sections follow.
 */
export function TablePhone({
  view,
  game,
  statusBar,
  errorBox,
  counterModal,
  onCommand,
}: {
  view: ClientView;
  game: PlayerView;
  statusBar: ReactNode;
  errorBox: ReactNode;
  counterModal: ReactNode;
  onCommand: OnCommand;
}) {
  const traderRows = (
    <div className="trader-rows">
      {game.seats.map((s) => (
        <TraderRow key={s.index} seat={s} game={game} view={view} isMe={s.index === game.seat} />
      ))}
    </div>
  );
  return (
    <div className="stack table-phone">
      {statusBar}
      <CardStrip game={game} />
      {game.phase === 'QUOTE_PREPARATION' ? (
        <>
          <QuotePanel game={game} onCommand={onCommand} compact error={errorBox} />
          {traderRows}
          <PhoneStats game={game} />
        </>
      ) : (
        <>
          {traderRows}
          <PhoneStats game={game} />
          <PhoneActionBar game={game} onCommand={onCommand} error={errorBox} />
        </>
      )}
      {/* The coach is keyed by round so it reopens or recollapses as each round starts. */}
      <PhoneCoach key={game.round} game={game} />
      <ActivityFeed events={game.events} seats={game.seats} collapsible />
      <HelpPanel />
      {counterModal}
    </div>
  );
}

/** The private card, marked as the player's own, and the community cards in one short row. */
function CardStrip({ game }: { game: PlayerView }) {
  return (
    <div className="card-strip" data-testid="card-strip">
      <div className="slot mine">
        <Card value={game.seats[game.seat!].privateCard} size="xs" label="Your private card" />
        <span>Yours</span>
      </div>
      {game.communityCards.map((c, i) => (
        <div className="slot" key={i}>
          <Card value={c} size="xs" label={`Community ${i + 1}`} />
          <span>{revealLabel(game, i)}</span>
        </div>
      ))}
    </div>
  );
}

/** The coach as a collapsible section, open in round 1 to guide new players and collapsed to its title from round 2. */
function PhoneCoach({ game }: { game: PlayerView }) {
  const [open, setOpen] = useState(game.round === 1);
  const tip = coachTip(game);
  if (!tip.title) return null;
  return (
    <details className="coach phone-section" data-testid="coach" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary data-testid="coach-title">{tip.title}</summary>
      <p data-testid="coach-tip">{tip.body}</p>
    </details>
  );
}

const PROGRESS_LABEL = { preparing: 'Preparing…', confirmed: 'Confirmed', acted: 'Acted' } as const;

/**
 * One trader as a compact row (name and badges, bid, ask, position, balance) in place of a seat tile.
 * It keeps the seat tile's test ids: seat-N on the row, bid-N and ask-N on the prices, takeover-N on the badge.
 */
function TraderRow({ seat, game, view, isMe }: { seat: SeatView; game: PlayerView; view: ClientView; isMe: boolean }) {
  const { active, takenOver, progress } = seatStatus(seat, game, view);
  const price = (side: Side) => {
    const value = seat.quote[side];
    return (
      <span className={`tr-price ${side} ${value === undefined ? 'empty' : ''}`} title={`${SIDE_TEXT[side].label}: ${SIDE_TEXT[side].verb}s at`}>
        <span className="tr-label">{SIDE_TEXT[side].label}</span>
        <strong data-testid={`${side}-${seat.index}`}>{value === undefined ? '—' : fmt(value)}</strong>
      </span>
    );
  };
  return (
    <div className={`trader-row ${active ? 'active' : ''} ${isMe ? 'me' : ''}`} data-testid={`seat-${seat.index}`} aria-current={active ? 'true' : undefined}>
      <div className="tr-who">
        <span className="tr-name">{seat.name}</span>
        <span className="tr-badges">
          {isMe && <span className="pill you">You</span>}
          {active && <span className="pill turn">Acting</span>}
          {seat.isBot && <span className="pill bot">Bot · {difficultyLabel(seat.difficulty)}</span>}
          {takenOver && (
            <span className="pill warn" data-testid={`takeover-${seat.index}`} title="Takeover: bot playing until they reconnect">
              Takeover
            </span>
          )}
          {progress && <span className="tr-status">{PROGRESS_LABEL[progress]}</span>}
        </span>
      </div>
      {game.phase === 'TRADING' ? (
        <>
          {price('bid')}
          {price('ask')}
        </>
      ) : (
        <span className="tr-quote-hidden muted">Quotes sealed</span>
      )}
      <span className="tr-num">
        <span className="tr-label">Position</span>
        {fmtPosition(seat.position)}
      </span>
      <span className="tr-num num">
        <span className="tr-label">Balance</span>
        {seat.balance}
      </span>
    </div>
  );
}

/** Available and Position in the play area; Balance, Cashflow and Reserved risk behind Details. */
function PhoneStats({ game }: { game: PlayerView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="phone-stats">
      <div className="phone-stats-main">
        <Stats game={game} keys={['available', 'position']} />
        <button type="button" className="btn btn-sm details-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="stat-details">
          {open ? 'Hide details' : 'Details'}
        </button>
      </div>
      {open && (
        <div className="phone-stats-more">
          <Stats game={game} keys={['balance', 'cashflow', 'reserved']} />
        </div>
      )}
    </div>
  );
}

/**
 * On the player's turn, one row of Buy, Sell, Counter-offer and Pass pinned to the bottom of the screen.
 * Off their turn the same row sits in the flow, disabled, so nothing is pinned. Buy, Sell and Counter-offer open
 * a bottom sheet with the trade confirmation or the counter-offer form. `error` (a refused command's message)
 * shows in the sheet while it is open, otherwise in the bar.
 */
function PhoneActionBar({ game, onCommand, error }: { game: PlayerView; onCommand: OnCommand; error: ReactNode }) {
  const a = useTradeActions(game, onCommand);
  const { mode, isMyTurn, waitingOn } = a;
  const sheetOpen = mode.kind !== 'idle';
  return (
    <>
      <div className={`action-bar ${isMyTurn ? 'pinned' : ''}`} data-testid="action-panel">
        {!sheetOpen && error}
        {!isMyTurn && <div className="muted small">{waitingOn ?? 'Trading has not started.'}</div>}
        <div className="action-bar-buttons">
          <ActionButtons actions={a} compact />
        </div>
      </div>
      {sheetOpen && (
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && a.cancel()}>
          <div className="sheet stack" role="dialog" aria-modal="true" aria-label={mode.kind === 'counter' ? 'Counter-offer' : mode.kind === 'buy' ? 'Buy' : 'Sell'} data-testid="action-sheet">
            {error}
            <ActionDetail game={game} actions={a} cancelLabel="Cancel" />
          </div>
        </div>
      )}
    </>
  );
}
