/**
 * Reflow packs multi-line text into one continuous stream, marking every
 * original hard newline with a visible ↵ glyph. The renderer then wraps the
 * stream at full page width, so short lines no longer waste a mostly-empty
 * pixel row — the dominant cost in image-token billing. The transform is
 * invertible: dereflow(reflow(x)) === minifyText(x) with tabs expanded.
 */
import { expandTabs, minifyText } from './wrap.js';

export const NEWLINE_MARK = '↵'; // ↵

/**
 * Join hard newlines with ↵. Returns null when the input already contains the
 * marker — the caller falls back to plain line rendering rather than corrupt
 * the round-trip.
 */
export function reflow(text: string): string | null {
  if (text.includes(NEWLINE_MARK)) return null;
  return minifyText(text).split('\n').map(expandTabs).join(NEWLINE_MARK);
}

/** Inverse of reflow. */
export function dereflow(reflowed: string): string {
  return reflowed.split(NEWLINE_MARK).join('\n');
}
