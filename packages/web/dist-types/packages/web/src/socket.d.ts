import type { Command, CommandResult, Difficulty } from '@bid-battle/engine';
import type { ClientView, JoinResponse } from '../../server/src/protocol';
export type ConnectionStatus = 'connecting' | 'online' | 'offline';
export interface GameClientListeners {
    onView(view: ClientView | null): void;
    onStatus(status: ConnectionStatus): void;
    onKicked(reason: string): void;
}
/** Thin wrapper around the Socket.IO connection. All game actions are commands acknowledged by the server. */
export declare class GameClient {
    private readonly listeners;
    private socket;
    private token;
    view: ClientView | null;
    constructor(listeners: GameClientListeners, url?: string);
    get hasSession(): boolean;
    private request;
    private session;
    createRoom(name: string): Promise<JoinResponse | {
        ok: false;
        error: string;
    }>;
    joinRoom(code: string, name: string): Promise<JoinResponse | {
        ok: false;
        error: string;
    }>;
    setSeat(seat: number, difficulty: Difficulty): Promise<CommandResult>;
    startMatch(): Promise<CommandResult>;
    leaveRoom(): Promise<void>;
    /** Send a game command with a fresh command id and the phase version the UI acted on. */
    send(action: Command): Promise<CommandResult>;
    private clearSession;
}
//# sourceMappingURL=socket.d.ts.map