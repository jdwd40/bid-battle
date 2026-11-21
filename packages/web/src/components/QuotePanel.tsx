import { useEffect, useState, type ReactNode } from 'react';
import { evaluateQuote, validateQuotePrices, type PlayerView, type QuoteSides, type Side } from '@bid-battle/engine';
import { fmt, SIDE_TEXT } from '../format';
import { fairEstimateLine, myFairEstimate, suggestedQuote } from '../coach';
import type { OnCommand } from './useTradeActions';

/**
 * The sealed-quote form. `compact` is the phone form: Bid and Ask side by side, Confirm full width below,
 * and `error` (a refused command's message) plus any problem with the prices directly above Confirm.
 * The form starts from the trader's unconfirmed draft if there is one, otherwise from the suggested quote:
 * a side the suggestion leaves off starts off, so with nothing affordable it starts on "Confirm: no prices".
 */
export function QuotePanel({ game, onCommand, compact = false, error = null }: { game: PlayerView; onCommand: OnCommand; compact?: boolean; error?: ReactNode }) {
  const local = game.me!;
  const sealed = local.sealedQuote;
  const suggested = suggestedQuote(game);
  const suggestion = suggested?.quote ?? null;
  const hasSuggestion = suggestion !== null && (suggestion.bid !== undefined || suggestion.ask !== undefined);
  const hasDraft = Boolean(sealed && (sealed.bid !== undefined || sealed.ask !== undefined));
  // Without a fair estimate yet (no suggestion at all), both sides start on and empty.
  const start: QuoteSides | null = hasDraft ? sealed! : suggestion;
  const [useBid, setUseBid] = useState(start ? start.bid !== undefined : true);
  const [useAsk, setUseAsk] = useState(start ? start.ask !== undefined : true);
  const [bid, setBid] = useState<string>(start?.bid !== undefined ? String(start.bid) : '');
  const [ask, setAsk] = useState<string>(start?.ask !== undefined ? String(start.ask) : '');
  const [busy, setBusy] = useState(false);

  /** Fill the form with the suggested quote: its sides on with their prices, any side it leaves off turned off. */
  const applySuggestion = () => {
    if (!suggestion) return;
    setUseBid(suggestion.bid !== undefined);
    setUseAsk(suggestion.ask !== undefined);
    if (suggestion.bid !== undefined) setBid(String(suggestion.bid));
    if (suggestion.ask !== undefined) setAsk(String(suggestion.ask));
  };

  // Reset the form with fresh suggestions when a new cycle begins.
  const cycleKey = `${game.round}-${game.cycle}`;
  useEffect(() => {
    if (!hasDraft) applySuggestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey]);

  const quote: QuoteSides = {};
  const bidNum = Number(bid);
  const askNum = Number(ask);
  if (useBid && bid.trim() !== '' && Number.isFinite(bidNum)) quote.bid = bidNum;
  if (useAsk && ask.trim() !== '' && Number.isFinite(askNum)) quote.ask = askNum;
  const incomplete = (useBid && quote.bid === undefined) || (useAsk && quote.ask === undefined);
  const priceError = incomplete ? 'enter a whole-number price for each side you are posting' : validateQuotePrices(quote, game.publicRange);
  const ev = priceError ? null : evaluateQuote(local.portfolio, quote, game.publicRange, game.positionLimit);
  const problem = priceError ?? (ev && !ev.ok ? `not affordable ${ev.reason}` : null);
  const confirmed = Boolean(sealed?.confirmed);
  const posting = useBid || useAsk;
  const estimate = myFairEstimate(game);

  const confirmQuote = async (skip = false) => {
    setBusy(true);
    await onCommand(skip ? { type: 'SEAL_QUOTE', confirm: true } : { type: 'SEAL_QUOTE', ...quote, confirm: true });
    setBusy(false);
  };
  const step = (setter: (v: string) => void, current: string, delta: number) => {
    const n = current.trim() === '' ? (estimate !== null ? Math.round(estimate) : 0) : Number(current);
    setter(String(Math.max(game.publicRange.L, Math.min(game.publicRange.U, n + delta))));
  };
  const sides = [
    { side: 'bid' as Side, use: useBid, setUse: setUseBid, value: bid, setValue: setBid },
    { side: 'ask' as Side, use: useAsk, setUse: setUseAsk, value: ask, setValue: setAsk },
  ];
  const confirmButton = (className: string) => (
    <button className={className} disabled={busy || (posting && Boolean(problem))} onClick={() => confirmQuote(false)} data-testid="confirm-quote">
      {posting ? 'Confirm my prices' : 'Confirm: no prices'}
    </button>
  );
  const skipButton = (
    <button className="btn" disabled={busy} onClick={() => confirmQuote(true)} data-testid="skip-quote">
      Skip this cycle
    </button>
  );
  const suggestButton = (label: string) =>
    hasSuggestion && (
      <button className="btn" onClick={applySuggestion} data-testid="suggest-quote">
        {label}
      </button>
    );
  // Why the suggestion leaves a side (or both) off, e.g. "No bid: a bid would take your position past the position limit".
  const suggestionNote = (Tag: 'div' | 'span') =>
    suggested?.reason && (
      <Tag className="muted small" data-testid="no-suggestion">
        {suggested.reason}
      </Tag>
    );

  if (confirmed) {
    return (
      <div className="panel stack" data-testid="quote-panel">
        <h2>Your sealed quote is confirmed</h2>
        <div className="best-levels">
          {sides.map(({ side }) => (
            <div className={`best ${side}`} key={side}>
              <div className="label">
                {SIDE_TEXT[side].label} — I {SIDE_TEXT[side].verb} at
              </div>
              <div className="price">{sealed?.[side] === undefined ? '—' : fmt(sealed[side])}</div>
            </div>
          ))}
        </div>
        <div className="hint">
          {sealed?.bid === undefined && sealed?.ask === undefined ? 'You are posting no prices this cycle. ' : ''}
          Reserved risk {local.reserved} · available {local.available}. Everyone's prices are revealed together once all traders have confirmed or the timer ends.
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="panel quote-compact" data-testid="quote-panel">
        <div className="quote-form">
          {sides.map((s) => {
            const text = SIDE_TEXT[s.side];
            return (
              <div className={`side ${s.side}`} key={s.side}>
                <button type="button" className={`toggle ${s.use ? 'on' : ''}`} aria-pressed={s.use} onClick={() => s.setUse((v) => !v)} data-testid={`use-${s.side}`}>
                  {text.label} · {s.use ? `I ${text.verb} at` : 'off'}
                </button>
                {s.use ? (
                  <div className="stepper">
                    <button type="button" className="btn btn-sm" onClick={() => step(s.setValue, s.value, -1)} aria-label={`Lower ${s.side} by one`}>
                      −
                    </button>
                    <input
                      className="input input-num"
                      type="number"
                      inputMode="numeric"
                      step={1}
                      value={s.value}
                      onChange={(e) => s.setValue(e.target.value)}
                      aria-label={`${text.label} price`}
                      data-testid={`${s.side}-input`}
                    />
                    <button type="button" className="btn btn-sm" onClick={() => step(s.setValue, s.value, 1)} aria-label={`Raise ${s.side} by one`}>
                      +
                    </button>
                  </div>
                ) : (
                  <div className="side-off muted small">Not {text.verbing}</div>
                )}
              </div>
            );
          })}
        </div>
        {error}
        {posting && problem ? (
          <div className="hint" role="status" data-testid="quote-error">
            Cannot post yet: {problem}.
          </div>
        ) : (
          <div className="muted small quote-status" role="status">
            {posting ? `Most you could lose if traded against: ${ev!.reserved} of ${local.portfolio.B}` : 'Posting no prices this cycle'}
          </div>
        )}
        {confirmButton('btn btn-primary btn-block')}
        <div className="quote-extras">
          {suggestButton('Suggest prices')}
          {skipButton}
        </div>
        {suggestionNote('div')}
      </div>
    );
  }

  return (
    <div className="panel stack" data-testid="quote-panel">
      <h2>Set your two prices</h2>
      <div className="hint">
        <strong>Bid</strong> = the price you would <strong>pay to buy</strong> one contract. <strong>Ask</strong> = the price you would{' '}
        <strong>sell</strong> one for. Keep your bid below your fair estimate and your ask above it. {estimate !== null && fairEstimateLine(game)}
      </div>
      <div className="quote-form">
        {sides.map((s) => {
          const text = SIDE_TEXT[s.side];
          return (
            <div className={`side ${s.side}`} key={s.side}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h4>
                  {text.label} — I {text.verb} at
                </h4>
                <button type="button" className={`toggle ${s.use ? 'on' : ''}`} aria-pressed={s.use} onClick={() => s.setUse((v) => !v)} data-testid={`use-${s.side}`}>
                  {s.use ? 'Posting' : 'Not posting'}
                </button>
              </div>
              {s.use ? (
                <div className="stepper">
                  <button type="button" className="btn btn-sm" onClick={() => step(s.setValue, s.value, -1)} aria-label={`Lower ${s.side} by one`}>
                    −1
                  </button>
                  <input
                    className="input input-num"
                    type="number"
                    inputMode="numeric"
                    step={1}
                    value={s.value}
                    onChange={(e) => s.setValue(e.target.value)}
                    aria-label={`${text.label} price`}
                    data-testid={`${s.side}-input`}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => step(s.setValue, s.value, 1)} aria-label={`Raise ${s.side} by one`}>
                    +1
                  </button>
                </div>
              ) : (
                <div className="muted small">You will not offer to {text.verb} this cycle.</div>
              )}
              <div className="muted small">
                {s.side === 'bid'
                  ? 'Lower bid = less likely to trade, but more profit if someone sells to you.'
                  : 'Higher ask = less likely to trade, but more profit if someone buys from you.'}
              </div>
            </div>
          );
        })}
      </div>
      {posting && problem ? (
        <div className="hint" role="status" data-testid="quote-error">
          Cannot post yet: {problem}. Prices must be whole numbers between {fmt(game.publicRange.L)} and {fmt(game.publicRange.U)}, with the bid below the ask.
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
        {confirmButton('btn btn-primary')}
        {suggestButton(`Use suggested (${suggestion?.bid === undefined ? '—' : fmt(suggestion.bid)} / ${suggestion?.ask === undefined ? '—' : fmt(suggestion.ask)})`)}
        {suggestionNote('span')}
        {skipButton}
        <span className="muted small">
          {game.seats.filter((s) => s.sealedQuoteConfirmed).length}/{game.seats.length} traders confirmed
        </span>
      </div>
    </div>
  );
}
