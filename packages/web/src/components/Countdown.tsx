import { useEffect, useState } from 'react';

interface Props {
  deadline: number | null;
  /** serverNow - Date.now() at the time of the last view. */
  offset: number;
  /** Total duration for the progress bar. */
  totalMs: number;
  label: string;
}

export function Countdown({ deadline, offset, totalMs, label }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (deadline === null) {
    return (
      <div className="countdown" aria-live="polite">
        <div className="muted small">{label}</div>
        <div className="time">—</div>
      </div>
    );
  }
  const remaining = Math.max(0, deadline - (now + offset));
  const secs = Math.ceil(remaining / 1000);
  const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
  return (
    <div className="countdown" aria-live="polite" data-testid="countdown">
      <div className="muted small">{label}</div>
      <div className={`time ${secs <= 5 ? 'urgent' : ''}`}>{secs}s</div>
      <div className="bar" aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
