import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, CommandResult, Difficulty } from '@bid-battle/engine';
import type { ClientView } from '../../server/src/protocol';
import { GameClient, type ConnectionStatus } from './socket';
import { JoinScreen } from './components/JoinScreen';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';
import { RoundReview } from './components/RoundReview';
import { MatchResults } from './components/MatchResults';
import { Tutorial } from './components/Tutorial';

const TUTORIAL_KEY = 'bidbattle.tutorialSeen';

export function App() {
  const clientRef = useRef<GameClient | null>(null);
  const [client, setClient] = useState<GameClient | null>(null);
  const [view, setView] = useState<ClientView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [resuming, setResuming] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialSeen, setTutorialSeen] = useState(() => {
    try {
      return localStorage.getItem(TUTORIAL_KEY) === '1';
    } catch {
      return true;
    }
  });

  // First time a player reaches the table, walk them through the game.
  const atTable = Boolean(view?.game && view.game.phase !== 'MATCH_COMPLETE');
  useEffect(() => {
    if (atTable && !tutorialSeen) setShowTutorial(true);
  }, [atTable, tutorialSeen]);
  const closeTutorial = () => {
    setShowTutorial(false);
    setTutorialSeen(true);
    try {
      localStorage.setItem(TUTORIAL_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const client = new GameClient({
      onView: (v) => {
        setView(v);
        setResuming(false);
        if (v?.game) setOffset(v.game.serverNow - Date.now());
      },
      onStatus: setStatus,
      onKicked: (reason) => {
        setView(null);
        setError(reason);
      },
    });
    clientRef.current = client;
    setClient(client);
    setResuming(client.hasSession);
  }, []);

  // Errors fade after a few seconds.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  const handle = useCallback(async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Something went wrong');
    return res;
  }, []);

  const onCommand = useCallback(
    async (cmd: Command): Promise<CommandResult> => {
      if (!clientRef.current) return { ok: false, error: 'not connected' };
      return (await handle(clientRef.current.send(cmd))) as CommandResult;
    },
    [handle],
  );

  let screen: React.ReactNode;
  if (!client || !view) {
    screen = resuming ? (
      <div className="screen-center panel">Reconnecting to your table…</div>
    ) : (
      <JoinScreen
        busy={busy || status !== 'online'}
        error={error}
        onCreate={(name) => handle(client!.createRoom(name))}
        onJoin={(code, name) => handle(client!.joinRoom(code, name))}
        onHowToPlay={() => setShowTutorial(true)}
      />
    );
  } else if (!view.game) {
    screen = (
      <Lobby
        view={view}
        error={error}
        onSetSeat={(seat: number, d: Difficulty) => handle(client.setSeat(seat, d))}
        onStart={() => handle(client.startMatch())}
        onLeave={() => client.leaveRoom()}
      />
    );
  } else if (view.game.phase === 'MATCH_COMPLETE') {
    screen = <MatchResults game={view.game} onLeave={() => client.leaveRoom()} />;
  } else if (view.game.phase === 'ROUND_REVIEW' && view.game.lastRound) {
    screen = <RoundReview view={view} game={view.game} offset={offset} error={error} onReady={() => onCommand({ type: 'READY' })} />;
  } else {
    screen = <Table view={view} game={view.game} offset={offset} error={error} onCommand={onCommand} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Bid <span>Battle</span>
          {view && (
            <span className="muted small" style={{ marginLeft: 12, letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>
              Room {view.room.code}
            </span>
          )}
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => setShowTutorial(true)} data-testid="how-to-play">
            How to play
          </button>
          <div className={`status ${status}`} data-testid="connection">
            {status === 'online' ? 'Connected' : status === 'offline' ? 'Reconnecting…' : 'Connecting…'}
          </div>
        </div>
      </header>
      {screen}
      {showTutorial && <Tutorial onClose={closeTutorial} />}
    </div>
  );
}
