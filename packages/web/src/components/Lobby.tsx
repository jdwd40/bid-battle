import { useState } from 'react';
import type { Difficulty } from '@bid-battle/engine';
import type { ClientView } from '../../../server/src/protocol';
import { difficultyLabel } from '../format';

interface Props {
  view: ClientView;
  error: string | null;
  onSetSeat(seat: number, difficulty: Difficulty): void;
  onStart(): void;
  onLeave(): void;
}

export function Lobby({ view, error, onSetSeat, onStart, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const humans = view.room.seats.filter((s) => s.kind === 'human').length;
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${view.room.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="screen-center stack" style={{ maxWidth: 760 }}>
      <div className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="muted small">Room code</div>
            <div className="room-code" data-testid="room-code">
              {view.room.code}
            </div>
          </div>
          <div className="stack" style={{ alignItems: 'flex-end' }}>
            <button className="btn btn-sm" onClick={copy}>
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
            <div className="muted small">Friends join with the code or the link.</div>
          </div>
        </div>
        <h2>Seats</h2>
        <div className="lobby-seats">
          {view.room.seats.map((s) => (
            <div className="lobby-seat" key={s.index} data-testid={`lobby-seat-${s.index}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted small">Seat {s.index + 1}</span>
                {s.kind === 'human' ? <span className="pill human">Human{s.isHost ? ' · Host' : ''}</span> : <span className="pill ai">AI</span>}
              </div>
              <div className="name">{s.name}</div>
              {s.kind === 'human' ? (
                <div className="muted small">{s.connected ? 'Connected' : 'Disconnected'}</div>
              ) : view.isHost ? (
                <label className="field">
                  AI difficulty
                  <select className="input" value={s.difficulty} onChange={(e) => onSetSeat(s.index, e.target.value as Difficulty)} data-testid={`difficulty-${s.index}`}>
                    <option value="easy">Easy — rough estimates, wide spreads</option>
                    <option value="normal">Normal — correct expected value</option>
                    <option value="hard">Hard — reads the market</option>
                  </select>
                </label>
              ) : (
                <div className="muted small">{difficultyLabel(s.difficulty)} AI</div>
              )}
            </div>
          ))}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn" onClick={onLeave}>
            Leave table
          </button>
          {view.isHost ? (
            <button className="btn btn-primary" onClick={onStart} data-testid="start-match">
              {humans === 1 ? 'Start solo match vs 3 AI' : `Start match (${humans} humans, ${4 - humans} AI)`}
            </button>
          ) : (
            <span className="muted">Waiting for the host to start…</span>
          )}
        </div>
      </div>
      <div className="panel small muted">
        <strong>How it plays:</strong> each round deals one private card to every trader and three face-down community cards. Everyone posts sealed
        bid/ask prices, then trades in turn across three cycles as community cards are revealed. Contracts settle on the sum of all seven dealt
        cards. Ten rounds, highest balance wins.
      </div>
    </div>
  );
}
