import { io, type Socket } from 'socket.io-client';
import type { Command, CommandResult, Difficulty } from '@bid-battle/engine';
import { SESSION_GONE, type ClientView, type JoinResponse } from '../../server/src/protocol';

/** Reconnect tokens persist across tab closes, one per room, so an invite link can return a player to their seat. */
const TOKEN_PREFIX = 'bidbattle.token.';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface GameClientListeners {
  onView(view: ClientView | null): void;
  onStatus(status: ConnectionStatus): void;
  onKicked(reason: string): void;
}

/** Thin wrapper around the Socket.IO connection. All game actions are commands acknowledged by the server. */
export class GameClient {
  private socket: Socket;
  private token: string | null;
  private room: string | null;
  view: ClientView | null = null;

  /** `room` is the code from the invite link; a token stored for that room is used to rejoin its seat. */
  constructor(private readonly listeners: GameClientListeners, room?: string | null, url?: string) {
    this.room = room ? room.toUpperCase() : null;
    this.token = this.room ? storage.get(this.room) : null;
    this.socket = io(url ?? '/', { transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => {
      listeners.onStatus('online');
      this.rejoin();
    });
    this.socket.on('disconnect', () => listeners.onStatus('offline'));
    this.socket.on('view', (view: ClientView) => {
      this.view = view;
      listeners.onView(view);
    });
    this.socket.on('roomClosed', (reason: string) => {
      this.clearSession();
      listeners.onKicked(reason);
    });
  }

  /** Rejoin the stored seat. Only forget the token when the server says the seat is gone; retry transient errors. */
  private rejoin(attempt = 0) {
    if (!this.token || !this.socket.connected) return;
    this.socket.emit('rejoin', { token: this.token }, (res: JoinResponse | { ok: false; error: string }) => {
      if (res.ok) return;
      if (res.error !== SESSION_GONE && attempt < 5) {
        setTimeout(() => this.rejoin(attempt + 1), 1000 * (attempt + 1));
        return;
      }
      this.listeners.onView(null);
      if (res.error !== SESSION_GONE) {
        // Still transient after retries: keep the token so reopening the link can try again.
        this.listeners.onKicked(res.error);
        return;
      }
      const code = this.room;
      this.clearSession();
      this.listeners.onKicked(`Your seat at table ${code} is no longer available. Join again below.`);
    });
  }

  get hasSession() {
    return this.token !== null;
  }

  private request<T>(event: string, payload: unknown): Promise<T> {
    return new Promise((resolve) => this.socket.emit(event, payload, (res: T) => resolve(res)));
  }

  private async session(event: 'createRoom' | 'joinRoom', payload: { name: string; code?: string }) {
    const res = await this.request<JoinResponse | { ok: false; error: string }>(event, payload);
    if (res.ok) {
      this.token = res.token;
      this.room = res.code;
      storage.set(res.code, res.token);
    }
    return res;
  }

  createRoom(name: string) {
    return this.session('createRoom', { name });
  }

  joinRoom(code: string, name: string) {
    return this.session('joinRoom', { name, code });
  }

  setSeat(seat: number, difficulty: Difficulty) {
    return this.request<CommandResult>('setSeat', { token: this.token, seat, difficulty });
  }

  startMatch() {
    return this.request<CommandResult>('startMatch', { token: this.token });
  }

  async leaveRoom() {
    await this.request('leaveRoom', { token: this.token });
    this.clearSession();
    this.view = null;
    this.listeners.onView(null);
  }

  /** Send a game command with a fresh command id and the phase version the UI acted on. */
  send(action: Command): Promise<CommandResult> {
    const phaseVersion = this.view?.game?.phaseVersion ?? -1;
    return this.request<CommandResult>('command', { token: this.token, commandId: newId(), phaseVersion, action });
  }

  private clearSession() {
    if (this.room) storage.remove(this.room);
    this.token = null;
  }
}

/** localStorage can throw (private mode, blocked site data); a missing token just means the join screen. */
const storage = {
  get(room: string): string | null {
    try {
      return localStorage.getItem(TOKEN_PREFIX + room);
    } catch {
      return null;
    }
  },
  set(room: string, token: string) {
    try {
      localStorage.setItem(TOKEN_PREFIX + room, token);
    } catch {
      /* ignore */
    }
  },
  remove(room: string) {
    try {
      localStorage.removeItem(TOKEN_PREFIX + room);
    } catch {
      /* ignore */
    }
  },
};

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
