import { expectedTotal, pairTradesFifo, type PlayerView, type SeatTradeRecord } from '@bid-battle/engine';
import type { ClientView } from '../../../server/src/protocol';
import { fmt, fmtSigned } from '../format';
import { Card } from './Card';
import { Countdown } from './Countdown';

interface Props {
  view: ClientView;
  game: PlayerView;
  offset: number;
  error: string | null;
  onReady(): void;
}

function contextLine(t: SeatTradeRecord): string {
  const ev = expectedTotal(t.context.ownCard, t.context.publicCards);
  const pub = t.context.publicCards.length ? t.context.publicCards.map(fmt).join(', ') : 'none';
  return `Cycle ${t.cycle}: you held ${fmt(t.context.ownCard)}, public cards ${pub}, possible range ${fmt(t.context.bounds.L)} to ${fmt(t.context.bounds.U)}, fair estimate ≈ ${ev.toFixed(1)}`;
}

export function RoundReview({ view, game, offset, error, onReady }: Props) {
  const r = game.lastRound!;
  const me = game.seat!;
  const mine = r.seats[me];
  const breakdown = pairTradesFifo(mine.trades, r.settlementValue);
  const meReady = game.seats[me].ready;
  const totalMs = 30_000;

  return (
    <div className="stack">
      <div className="table-head">
        <div className="meta">
          <strong>Round {r.round} review</strong>
          <span className="muted">
            Round {game.round} of {game.totalRounds}
          </span>
        </div>
        <Countdown deadline={game.deadline} offset={offset} totalMs={totalMs} label="Next round in" />
      </div>

      <div className="panel">
        <h2>Revealed cards</h2>
        <div className="reveal-row" data-testid="reveal-row">
          {r.privateCards.map((c, i) => (
            <div className="who" key={i}>
              <Card value={c} size="sm" label={game.seats[i].name} />
              <span>{game.seats[i].name}</span>
            </div>
          ))}
          <span className="muted" style={{ alignSelf: 'center' }}>
            +
          </span>
          {r.communityCards.map((c, i) => (
            <div className="who" key={`c${i}`}>
              <Card value={c} size="sm" label={`Community ${i + 1}`} />
              <span>Community</span>
            </div>
          ))}
          <span className="muted" style={{ alignSelf: 'center' }}>
            =
          </span>
          <div className="who">
            <span className="total-badge" data-testid="settlement-value">
              {fmt(r.settlementValue)}
            </span>
            <span>Settlement value</span>
          </div>
        </div>
      </div>

      <div className="review-grid">
        <div className="panel">
          <h2>Round results</h2>
          <table className="data" data-testid="results-table">
            <thead>
              <tr>
                <th>Trader</th>
                <th className="num">Position</th>
                <th className="num">Cashflow</th>
                <th className="num">Round P&amp;L</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {r.seats.map((s) => (
                <tr key={s.seat} style={s.seat === me ? { fontWeight: 700 } : undefined}>
                  <td>
                    {game.seats[s.seat].name}
                    {s.seat === me ? ' (you)' : ''}
                  </td>
                  <td className="num">{fmtSigned(s.position)}</td>
                  <td className="num">{fmtSigned(s.cashflow)}</td>
                  <td className={`num ${s.pnl > 0 ? 'pos' : s.pnl < 0 ? 'neg' : ''}`}>{fmtSigned(s.pnl)}</td>
                  <td className="num">{s.endBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            P&amp;L = cashflow + position × value. For you: {fmtSigned(mine.cashflow)} + ({fmtSigned(mine.position)} × {fmt(r.settlementValue)}) ={' '}
            {fmtSigned(mine.pnl)}.
          </p>
        </div>

        <div className="panel">
          <h2>Your trades</h2>
          {mine.trades.length === 0 ? (
            <p className="muted">You did not trade this round. Sitting out is a valid choice when the prices on offer are not attractive.</p>
          ) : (
            <>
              <table className="data">
                <thead>
                  <tr>
                    <th>Cycle</th>
                    <th>Trade</th>
                    <th className="num">Price</th>
                    <th className="num">vs value</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.trades.map((t) => {
                    const vs = t.side === 'BUY' ? r.settlementValue - t.price : t.price - r.settlementValue;
                    return (
                      <tr key={t.tradeId}>
                        <td>{t.cycle}</td>
                        <td>
                          {t.side === 'BUY' ? 'Bought from' : 'Sold to'} {game.seats[t.counterparty].name}
                          {t.via === 'counter' ? ' (negotiated)' : ''}
                        </td>
                        <td className="num">{fmt(t.price)}</td>
                        <td className={`num ${vs > 0 ? 'pos' : vs < 0 ? 'neg' : ''}`}>{fmtSigned(vs)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <h3 style={{ marginTop: 12 }}>Locked vs exposed (FIFO pairing)</h3>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {breakdown.pairs.map((p, i) => (
                  <li key={i}>
                    Bought at {fmt(p.open.side === 'BUY' ? p.open.price : p.close.price)}, sold at {fmt(p.open.side === 'SELL' ? p.open.price : p.close.price)}:{' '}
                    <strong className={p.profit >= 0 ? 'pos' : 'neg'}>{fmtSigned(p.profit)}</strong> locked regardless of the cards.
                  </li>
                ))}
                {breakdown.open.map((t) => (
                  <li key={t.tradeId}>
                    Open {t.side === 'BUY' ? 'long' : 'short'} at {fmt(t.price)} settled against {fmt(r.settlementValue)}:{' '}
                    <strong className={(t.side === 'BUY' ? r.settlementValue - t.price : t.price - r.settlementValue) >= 0 ? 'pos' : 'neg'}>
                      {fmtSigned(t.side === 'BUY' ? r.settlementValue - t.price : t.price - r.settlementValue)}
                    </strong>
                  </li>
                ))}
                <li>
                  Completed pairs {fmtSigned(breakdown.realized)} + remaining exposure {fmtSigned(breakdown.settled)} = {fmtSigned(breakdown.total)}.
                </li>
              </ul>
              <h3 style={{ marginTop: 12 }}>What you knew at the time</h3>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                {mine.trades.map((t) => (
                  <li key={t.tradeId}>
                    {t.side === 'BUY' ? 'Buy' : 'Sell'} at {fmt(t.price)} — {contextLine(t)}.{' '}
                    {(() => {
                      const ev = expectedTotal(t.context.ownCard, t.context.publicCards);
                      const edge = t.side === 'BUY' ? ev - t.price : t.price - ev;
                      return edge >= 0
                        ? `Price was ${edge.toFixed(1)} better than your fair estimate: a sound trade on the information you had, whatever the outcome.`
                        : `Price was ${Math.abs(edge).toFixed(1)} worse than your fair estimate: the outcome does not change that the odds were against it.`;
                    })()}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="seat-status">
          {game.seats.map((s) => (
            <span key={s.index} className={`pill ${s.ready ? 'human' : ''}`}>
              {s.name}: {s.ready ? 'ready' : 'reviewing'}
            </span>
          ))}
        </div>
        <button className="btn btn-primary" onClick={onReady} disabled={meReady} data-testid="ready">
          {meReady ? 'Waiting for others…' : game.round >= game.totalRounds ? 'See final results' : 'Ready for next round'}
        </button>
      </div>
      <p className="muted small">{view.aiControlled.some((a, i) => a && !game.seats[i].isBot) ? 'Disconnected players are being played by a Normal AI until they return.' : ''}</p>
    </div>
  );
}
