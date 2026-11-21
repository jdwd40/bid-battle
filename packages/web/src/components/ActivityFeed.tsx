import { useEffect, useRef } from 'react';
import type { LoggedEvent, SeatView } from '@bid-battle/engine';
import { describeEvent } from '../format';

interface Props {
  events: LoggedEvent[];
  seats: SeatView[];
  /** Phones: a collapsible section that starts closed, opened by tapping its title. */
  collapsible?: boolean;
}

export function ActivityFeed({ events, seats, collapsible = false }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [events.length]);
  const items = events
    .map((e) => ({ e, text: describeEvent(e, seats) }))
    .filter((x) => x.text !== null)
    .reverse()
    .slice(0, 40);
  const list = (
    <ul className="feed" ref={ref} aria-live="polite" aria-relevant="additions" data-testid="activity-feed">
      {items.map(({ e, text }) => (
        <li key={e.seq} className={e.event.type === 'TRADE' ? 'trade' : e.event.type === 'QUOTE_CANCELLED' ? 'cancel' : ''}>
          <span className="muted small">R{e.round}·C{e.cycle} </span>
          {text}
        </li>
      ))}
      {items.length === 0 && <li className="muted">Nothing yet.</li>}
    </ul>
  );
  if (collapsible) {
    return (
      <details className="panel phone-section">
        <summary>Activity</summary>
        {list}
      </details>
    );
  }
  return (
    <div className="panel">
      <h3>Activity</h3>
      {list}
    </div>
  );
}
