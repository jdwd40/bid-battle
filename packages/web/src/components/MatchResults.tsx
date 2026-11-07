import type { PlayerView } from '@bid-battle/engine';
import { difficultyLabel, fmtSigned } from '../format';

interface Props {
  game: PlayerView;
  onLeave(): void;
}

const COLORS = ['#f3c969', '#7fc4ff', '#5fd39a', '#ff8c7a'];

export function MatchResults({ game, onLeave }: Props) {
  const me = game.seat!;
  const ranked = [...game.seats].sort((a, b) => b.balance - a.balance);
  const winners = new Set(game.winners ?? []);
  const history = [game.seats.map(() => 100), ...game.balanceHistory];
  const all = history.flat();
  const min = Math.min(...all);
  const max = Math.max(...all);
  const W = 600;
  const H = 120;
  const x = (i: number) => (i / Math.max(1, history.length - 1)) * (W - 20) + 10;
  const y = (v: number) => H - 10 - ((v - min) / Math.max(1, max - min)) * (H - 20);

  return (
    <div className="screen-center stack" style={{ maxWidth: 860 }}>
      <div className="hero">
        <h1>
          {winners.has(me) ? (winners.size > 1 ? 'Shared ' : '') + 'Victory' : 'Match ' }
          <span>{winners.has(me) ? '' : 'Complete'}</span>
        </h1>
        <p data-testid="winner-line">
          {winners.size > 1 ? 'Winners: ' : 'Winner: '}
          {[...winners].map((w) => game.seats[w].name).join(', ')}
        </p>
      </div>
      <div className="panel">
        <h2>Final standings</h2>
        <div className="podium">
          {ranked.map((s, i) => (
            <div className={`place ${winners.has(s.index) ? 'winner' : ''}`} key={s.index}>
              <div className="rank">#{i + 1}</div>
              <div style={{ fontWeight: 700 }}>
                {s.name}
                {s.index === me ? ' (you)' : ''}
              </div>
              <div className="muted small">{s.isBot ? `${difficultyLabel(s.difficulty)} AI` : 'Human'}</div>
              <div className="bal">{s.balance}</div>
              <div className={`small ${s.balance - 100 >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(s.balance - 100)} over the match</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>Balance by round</h2>
        <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Balance history for each trader">
          {game.seats.map((s, si) => (
            <polyline
              key={s.index}
              fill="none"
              stroke={COLORS[si]}
              strokeWidth={s.index === me ? 3 : 1.5}
              points={history.map((row, i) => `${x(i)},${y(row[si])}`).join(' ')}
            />
          ))}
        </svg>
        <div className="row small">
          {game.seats.map((s, si) => (
            <span key={s.index} className="pill" style={{ borderColor: COLORS[si] }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[si], display: 'inline-block' }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={onLeave} data-testid="back-to-start">
          Back to start
        </button>
      </div>
    </div>
  );
}
