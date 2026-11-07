import { useState, type FormEvent } from 'react';

interface Props {
  busy: boolean;
  error: string | null;
  onCreate(name: string): void;
  onJoin(code: string, name: string): void;
  onHowToPlay(): void;
}

function initialCode(): string {
  try {
    return new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  } catch {
    return '';
  }
}

export function JoinScreen({ busy, error, onCreate, onJoin, onHowToPlay }: Props) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('bidbattle.name') ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState(initialCode);

  const remember = () => {
    try {
      localStorage.setItem('bidbattle.name', name.trim());
    } catch {
      /* ignore */
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    remember();
    onCreate(name.trim());
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    remember();
    onJoin(code.trim().toUpperCase(), name.trim());
  };

  return (
    <div className="screen-center stack">
      <div className="hero">
        <h1>
          Bid <span>Battle</span>
        </h1>
        <p>Four traders. Seven hidden cards. Guess the total, set your prices, trade, and settle when the cards flip.</p>
        <p>
          <button className="btn btn-sm" onClick={onHowToPlay} data-testid="how-to-play-intro">
            New here? Read how to play (2 minutes)
          </button>
        </p>
      </div>
      <div className="panel stack">
        <label className="field">
          Display name
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="e.g. Ada"
            autoComplete="nickname"
            data-testid="name-input"
            required
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={create} className="stack">
          <button className="btn btn-primary" disabled={busy || !name.trim()} data-testid="create-room">
            Create a private table
          </button>
          <div className="muted small">Play solo against three AI traders, or share the room code with friends.</div>
        </form>
        <div className="divider">or join a table</div>
        <form onSubmit={join} className="row">
          <input
            className="input"
            style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.2em' }}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={5}
            placeholder="ROOM CODE"
            aria-label="Room code"
            data-testid="code-input"
          />
          <button className="btn" disabled={busy || !name.trim() || code.trim().length < 4} data-testid="join-room">
            Join
          </button>
        </form>
      </div>
      <div className="muted small" style={{ textAlign: 'center' }}>
        Fictional credits only. No real money is involved.
      </div>
    </div>
  );
}
