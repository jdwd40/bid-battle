import type { PlayerView } from '@bid-battle/engine';
import { fmt, fmtPosition, fmtSigned } from '../format';
import type { TradeActions, TradePreview } from './useTradeActions';

/**
 * Buy, Sell, Counter-offer and Pass, disabled with the reason as their title when unavailable. `compact` (the phone
 * bar) shows the best price as a short tag on Buy and Sell; otherwise they read "Buy at …" and "Sell at …".
 */
export function ActionButtons({ actions: a, compact = false }: { actions: TradeActions; compact?: boolean }) {
  const { busy, levels, isMyTurn, waitingOn, buyReason, sellReason, counterReason } = a;
  const price = (p: number | undefined) => p !== undefined && (compact ? <span className="action-price">{fmt(p)}</span> : `at ${fmt(p)}`);
  return (
    <>
      <button className="btn btn-buy" disabled={busy || Boolean(buyReason)} title={buyReason ?? undefined} onClick={a.buy} data-testid="buy">
        Buy {price(levels.bestAsk?.price)}
      </button>
      <button className="btn btn-sell" disabled={busy || Boolean(sellReason)} title={sellReason ?? undefined} onClick={a.sell} data-testid="sell">
        Sell {price(levels.bestBid?.price)}
      </button>
      <button className="btn" disabled={busy || Boolean(counterReason)} title={counterReason ?? undefined} onClick={a.counter} data-testid="counter">
        Counter-offer
      </button>
      <button className="btn" disabled={busy || !isMyTurn} title={!isMyTurn ? waitingOn ?? 'Not your turn' : undefined} onClick={() => a.run({ type: 'PASS' })} data-testid="pass">
        Pass
      </button>
    </>
  );
}

/** The chosen action's trade confirmation or counter-offer form; nothing while no action is chosen. */
export function ActionDetail({ game, actions: a, cancelLabel }: { game: PlayerView; actions: TradeActions; cancelLabel: string }) {
  const { mode, busy, chosen, counterProblem, counterNum } = a;
  if (mode.kind === 'buy' || mode.kind === 'sell') {
    return (
      <TradeConfirm
        kind={mode.kind}
        target={game.seats[mode.target].name}
        price={mode.price}
        preview={a.preview(mode.kind, mode.price)}
        busy={busy}
        cancelLabel={cancelLabel}
        onCancel={a.cancel}
        onConfirm={() => a.run(mode.kind === 'buy' ? { type: 'BUY', target: mode.target, price: mode.price } : { type: 'SELL', target: mode.target, price: mode.price })}
      />
    );
  }
  if (mode.kind !== 'counter' || !chosen) return null;
  return (
    <div className="stack">
      <label className="field">
        Counter against
        <select className="input" value={chosen.key} onChange={(e) => a.setCounterTarget(e.target.value)} data-testid="counter-target">
          {a.counterOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Your price ({chosen.side === 'ask' ? 'you would buy' : 'you would sell'} one contract)
        <input className="input input-num" type="number" inputMode="numeric" step={1} value={a.counterPrice} onChange={(e) => a.setCounterPrice(e.target.value)} data-testid="counter-price" />
      </label>
      {counterProblem ? (
        <div className="hint">Cannot send: {counterProblem}.</div>
      ) : (
        <PreviewBox label={`If ${game.seats[chosen.seat].name} accepts`} preview={a.preview(chosen.side === 'ask' ? 'buy' : 'sell', counterNum)} />
      )}
      <div className="row">
        <button className="btn btn-primary" disabled={busy || Boolean(counterProblem)} onClick={() => a.run({ type: 'COUNTER', target: chosen.seat, side: chosen.side, price: counterNum })} data-testid="send-counter">
          Send counter-offer
        </button>
        <button className="btn" onClick={a.cancel} data-testid="cancel-action">
          {cancelLabel}
        </button>
      </div>
      <div className="muted small">They have 10 seconds to accept or decline. Either way this uses your action for the cycle.</div>
    </div>
  );
}

export function PreviewBox({ label, preview }: { label: string; preview: TradePreview }) {
  return (
    <div className="preview" data-testid="trade-preview">
      <strong>{label}:</strong> position {fmtPosition(preview.portfolio.q)} · cashflow {fmtSigned(preview.portfolio.C)} · reserved risk {preview.reserved} · available{' '}
      {preview.portfolio.B - preview.reserved}
      {preview.cancellations.length > 0 && (
        <ul>
          {preview.cancellations.map((c, i) => (
            <li key={i}>
              Your {c.side} at {fmt(c.price)} would be removed by risk cancellation ({c.reason}).
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TradeConfirm({
  kind,
  target,
  price,
  preview,
  busy,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  kind: 'buy' | 'sell';
  target: string;
  price: number;
  preview: TradePreview;
  busy: boolean;
  cancelLabel: string;
  onCancel(): void;
  onConfirm(): void;
}) {
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
        <button className="btn" onClick={onCancel} data-testid="cancel-action">
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
