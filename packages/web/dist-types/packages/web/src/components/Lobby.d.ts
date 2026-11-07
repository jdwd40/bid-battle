import type { Difficulty } from '@bid-battle/engine';
import type { ClientView } from '../../../server/src/protocol';
interface Props {
    view: ClientView;
    error: string | null;
    onSetSeat(seat: number, difficulty: Difficulty): void;
    onStart(): void;
    onLeave(): void;
}
export declare function Lobby({ view, error, onSetSeat, onStart, onLeave }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=Lobby.d.ts.map