interface Props {
    busy: boolean;
    error: string | null;
    onCreate(name: string): void;
    onJoin(code: string, name: string): void;
    onHowToPlay(): void;
}
export declare function JoinScreen({ busy, error, onCreate, onJoin, onHowToPlay }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=JoinScreen.d.ts.map