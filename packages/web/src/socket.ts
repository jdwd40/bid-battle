import { io, type Socket } from 'socket.io-client';
import type { Command, CommandResult, Difficulty } from '@bid-battle/engine';
import type { ClientView, JoinResponse } from '../../server/src/protocol';

const TOKEN_KEY = 'bidbattle.token';

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
  view: ClientView | null = null;

  constructor(private readonly listeners: GameClientListeners, url?: string) {
    this.token = readToken();
    this.socket = io(url ?? '/', { transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => {
      listeners.onStatus('online');
      if (this.token) {
        this.socket.emit('rejoin', { token: this.token }, (res: JoinResponse | { ok: false; error: string }) => {
          if (!res.ok) {
            this.clearSession();
            listeners.onView(null);
          }
        });
      }
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
      sessionStorage.setItem(TOKEN_KEY, res.token);
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
    this.token = null;
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
