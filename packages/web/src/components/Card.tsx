import { fmt } from '../format';

interface Props {
  value: number | null;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

/** A playing card. `null` renders face down. Negative cards are visually distinct and labelled. */
export function Card({ value, size = 'md', label }: Props) {
  const cls = ['card', size === 'md' ? '' : size, value === null ? 'hidden' : '', value !== null && value < 0 ? 'negative' : '']
    .filter(Boolean)
    .join(' ');
  const text = value === null ? 'Hidden card' : `${label ? label + ': ' : ''}${value < 0 ? `minus ${Math.abs(value)}` : value}`;
  return (
    <div className={cls} role="img" aria-label={text} data-testid="card" data-value={value ?? 'hidden'}>
      {value !== null && <span className="corner">{fmt(value)}</span>}
      {value !== null ? fmt(value) : ''}
    </div>
  );
}
