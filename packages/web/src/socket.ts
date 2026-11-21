import { io, type Socket } from 'socket.io-client';
import type { Command, CommandResult, Difficulty } from '@bid-battle/engine';
import type { AckFailure, ClientView, JoinResponse } from '../../server/src/protocol';
import { safely } from './safely';

/** Reconnect tokens persist across tab closes, one per room, so an invite link can return a player to their seat. */
const TOKEN_PREFIX = 'bidbattle.token.';
/** How long leaving waits for the server's ack before returning to the join screen anyway. */
const LEAVE_ACK_TIMEOUT_MS = 1500;
const REJOIN_RETRIES = 5;

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface GameClientListeners {
  onView(view: ClientView | null): void;
  onStatus(status: ConnectionStatus): void;
  /** The seat is gone for good (the room closed, or the server no longer knows the session); the token is forgotten. */
  onSessionEnded(reason: string): void;
  /** Rejoining kept failing for a temporary reason; the token is kept so reopening the link can try again. */
  onRejoinFailed(reason: string): void;
}

/** Thin wrapper around the Socket.IO connection. All game actions are commands acknowledged by the server. */
export class GameClient {
  private socket: Socket;
  private token: string | null;
  private room: string | null;
  view: ClientView | null = null;
  /** Bumped by every new rejoin chain, so a superseded chain's acks and retries do nothing. */
  private rejoinChain = 0;
  private rejoinTimer: ReturnType<typeof setTimeout> | undefined;

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
      if (!this.token) return; // left (or lost) the seat; ignore views still in flight
      this.view = view;
      listeners.onView(view);
    });
    this.socket.on('roomClosed', (reason: string) => {
      this.clearSession();
      listeners.onSessionEnded(reason);
    });
  }

  /**
   * Rejoin the stored seat, starting a new chain and cancelling any earlier one, so only one chain
   * is ever in flight. Only forget the token when the server says the seat is gone; retry transient errors.
   */
  private rejoin() {
    this.stopRejoin();
    const chain = this.rejoinChain;
    const attempt = (n: number) => {
      if (chain !== this.rejoinChain || !this.token || !this.socket.connected) return;
      this.socket.emit('rejoin', { token: this.token }, (res: JoinResponse | AckFailure) => {
        if (chain !== this.rejoinChain || res.ok) return;
        const gone = res.code === 'SESSION_GONE';
        if (!gone && n < REJOIN_RETRIES) {
          this.rejoinTimer = setTimeout(() => attempt(n + 1), 1000 * (n + 1));
          return;
        }
        this.listeners.onView(null);
        if (!gone) {
          // Still transient after retries: keep the token so reopening the link can try again.
          this.listeners.onRejoinFailed(res.error);
          return;
        }
        const code = this.room;
        this.clearSession();
        this.listeners.onSessionEnded(`Your seat in room ${code} is no longer available. Join again below.`);
      });
    };
    attempt(0);
  }

  /** Cancel the rejoin chain in progress: its pending retry, and its ack if one is still awaited. */
  private stopRejoin() {
    clearTimeout(this.rejoinTimer);
    this.rejoinTimer = undefined;
    this.rejoinChain++;
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
      this.stopRejoin();
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

  /** Forget the seat first, so it is forgotten even if the server's ack never arrives; then wait briefly for that ack. */
  async leaveRoom() {
    const token = this.token;
    this.clearSession();
    this.view = null;
    await Promise.race([this.request('leaveRoom', { token }), new Promise((resolve) => setTimeout(resolve, LEAVE_ACK_TIMEOUT_MS))]);
    this.listeners.onView(null);
  }

  /** Send a game command with a fresh command id and the phase version the UI acted on. */
  send(action: Command): Promise<CommandResult> {
    const phaseVersion = this.view?.game?.phaseVersion ?? -1;
    return this.request<CommandResult>('command', { token: this.token, commandId: newId(), phaseVersion, action });
  }

  private clearSession() {
    this.stopRejoin();
    if (this.room) storage.remove(this.room);
    this.token = null;
  }
}

/** Stored reconnect tokens; when storage is unavailable a missing token just means the join screen. */
const storage = {
  get: (room: string): string | null => safely(() => localStorage.getItem(TOKEN_PREFIX + room), null),
  set: (room: string, token: string) => safely(() => localStorage.setItem(TOKEN_PREFIX + room, token), undefined),
  remove: (room: string) => safely(() => localStorage.removeItem(TOKEN_PREFIX + room), undefined),
};

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
