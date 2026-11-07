import type { Command, CommandResult, Difficulty, PlayerView } from '@bid-battle/engine';
export type SeatKind = 'open' | 'human' | 'bot';
export interface LobbySeatView {
    index: number;
    kind: SeatKind;
    name: string;
    difficulty: Difficulty;
    connected: boolean;
    isHost: boolean;
}
export interface LobbyView {
    code: string;
    started: boolean;
    seats: LobbySeatView[];
}
/** Everything a connected client receives. Always built per player; never raw server state. */
export interface ClientView {
    room: LobbyView;
    seat: number;
    isHost: boolean;
    /** Seats currently driven by the AI because the human is disconnected. */
    aiControlled: boolean[];
    connected: boolean[];
    game: PlayerView | null;
}
export interface JoinRequest {
    name: string;
    code?: string;
}
export interface JoinResponse {
    ok: true;
    code: string;
    token: string;
    seat: number;
}
export interface RejoinRequest {
    token: string;
}
export interface SetSeatRequest {
    token: string;
    seat: number;
    difficulty: Difficulty;
}
export interface CommandRequest {
    token: string;
    commandId: string;
    phaseVersion: number;
    action: Command;
}
export type Ack<T> = (res: T | {
    ok: false;
    error: string;
}) => void;
export interface ClientToServerEvents {
    createRoom: (req: JoinRequest, ack: Ack<JoinResponse>) => void;
    joinRoom: (req: JoinRequest, ack: Ack<JoinResponse>) => void;
    rejoin: (req: RejoinRequest, ack: Ack<JoinResponse>) => void;
    setSeat: (req: SetSeatRequest, ack: Ack<{
        ok: true;
    }>) => void;
    startMatch: (req: {
        token: string;
    }, ack: Ack<{
        ok: true;
    }>) => void;
    leaveRoom: (req: {
        token: string;
    }, ack: Ack<{
        ok: true;
    }>) => void;
    command: (req: CommandRequest, ack: (res: CommandResult) => void) => void;
}
export interface ServerToClientEvents {
    view: (view: ClientView) => void;
    roomClosed: (reason: string) => void;
}
//# sourceMappingURL=protocol.d.ts.map