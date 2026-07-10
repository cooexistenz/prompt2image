/**
 * Text normalization and column-aware line wrapping. Every atlas glyph is one
 * cell wide, so display width equals codepoint count; iteration is by
 * codepoint so surrogate pairs count once.
 */
export declare const TAB_WIDTH = 4;
export declare const TAB_MARK = "\u2192";
/** Strip trailing whitespace per line and cap blank-line runs at two. */
export declare function minifyText(text: string): string;
/** Expand tabs to a visible → marker padded to the next 4-column stop. */
export declare function expandTabs(line: string): string;
/** Codepoint count (display width in cells). */
export declare function measureCols(line: string): number;
/** Width of the widest line after tab expansion, capped at maxCols. */
export declare function contentCols(text: string, maxCols: number): number;
/** Hard-wrap normalized text into rows of at most `cols` cells. */
export declare function wrapLines(text: string, cols: number): string[];
