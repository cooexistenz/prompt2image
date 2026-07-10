export declare const NEWLINE_MARK = "\u21B5";
/**
 * Join hard newlines with ↵. Returns null when the input already contains the
 * marker — the caller falls back to plain line rendering rather than corrupt
 * the round-trip.
 */
export declare function reflow(text: string): string | null;
/** Inverse of reflow. */
export declare function dereflow(reflowed: string): string;
