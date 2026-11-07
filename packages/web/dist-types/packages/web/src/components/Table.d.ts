import { type Command, type CommandResult, type PlayerView } from '@bid-battle/engine';
import type { ClientView } from '../../../server/src/protocol';
interface Props {
    view: ClientView;
    game: PlayerView;
    offset: number;
    error: string | null;
    onCommand(cmd: Command): Promise<CommandResult>;
}
export declare function Table({ view, game, offset, error, onCommand }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=Table.d.ts.map