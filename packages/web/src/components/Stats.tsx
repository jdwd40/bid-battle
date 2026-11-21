import type { PlayerView } from '@bid-battle/engine';
import { fmtPosition, fmtSigned } from '../format';

export type StatKey = 'balance' | 'position' | 'cashflow' | 'reserved' | 'available';

/** The local trader's stats, keyed so the desktop and phone layouts can each pick and order them. */
export function myStats(game: PlayerView): Record<StatKey, { label: string; value: string; testId?: string }> {
  const local = game.me!;
  return {
    balance: { label: 'Balance', value: `${game.seats[game.seat!].balance}`, testId: 'balance' },
    position: { label: 'Position', value: fmtPosition(local.portfolio.q), testId: 'position' },
    cashflow: { label: 'Cashflow', value: fmtSigned(local.portfolio.C) },
    reserved: { label: 'Reserved risk', value: `${local.reserved}`, testId: 'reserved' },
    available: { label: 'Available', value: `${local.available}`, testId: 'available' },
  };
}

/** The listed stats of the local trader, in order. */
export function Stats({ game, keys }: { game: PlayerView; keys: StatKey[] }) {
  const stats = myStats(game);
  return (
    <>
      {keys.map((k) => (
        <div className="stat" key={k}>
          <div className="label">{stats[k].label}</div>
          <div className="value" data-testid={stats[k].testId}>
            {stats[k].value}
          </div>
        </div>
      ))}
    </>
  );
}
