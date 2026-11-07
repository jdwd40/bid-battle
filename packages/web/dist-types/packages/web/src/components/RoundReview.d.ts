import { type PlayerView } from '@bid-battle/engine';
import type { ClientView } from '../../../server/src/protocol';
interface Props {
    view: ClientView;
    game: PlayerView;
    offset: number;
    error: string | null;
    onReady(): void;
}
export declare function RoundReview({ view, game, offset, error, onReady }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=RoundReview.d.ts.map