interface Props {
    deadline: number | null;
    /** serverNow - Date.now() at the time of the last view. */
    offset: number;
    /** Total duration for the progress bar. */
    totalMs: number;
    label: string;
}
export declare function Countdown({ deadline, offset, totalMs, label }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=Countdown.d.ts.map