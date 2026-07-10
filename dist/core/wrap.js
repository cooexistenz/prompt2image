/**
 * Text normalization and column-aware line wrapping. Every atlas glyph is one
 * cell wide, so display width equals codepoint count; iteration is by
 * codepoint so surrogate pairs count once.
 */
export const TAB_WIDTH = 4;
export const TAB_MARK = '→'; // U+2192, present in both atlases
/** Strip trailing whitespace per line and cap blank-line runs at two. */
export function minifyText(text) {
    return text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join('\n')
        .replace(/\n{4,}/g, '\n\n\n');
}
/** Expand tabs to a visible → marker padded to the next 4-column stop. */
export function expandTabs(line) {
    if (!line.includes('\t'))
        return line;
    let out = '';
    let col = 0;
    for (const ch of line) {
        if (ch === '\t') {
            const span = TAB_WIDTH - (col % TAB_WIDTH);
            out += TAB_MARK + ' '.repeat(span - 1);
            col += span;
        }
        else {
            out += ch;
            col += 1;
        }
    }
    return out;
}
/** Codepoint count (display width in cells). */
export function measureCols(line) {
    let n = 0;
    for (const _ of line)
        n++;
    return n;
}
/** Width of the widest line after tab expansion, capped at maxCols. */
export function contentCols(text, maxCols) {
    let widest = 1;
    for (const line of text.split('\n')) {
        const w = measureCols(expandTabs(line));
        if (w > widest)
            widest = w;
        if (widest >= maxCols)
            return maxCols;
    }
    return Math.min(widest, maxCols);
}
/** Hard-wrap normalized text into rows of at most `cols` cells. */
export function wrapLines(text, cols) {
    const out = [];
    for (const raw of text.split('\n')) {
        const line = expandTabs(raw);
        if (line.length === 0) {
            out.push('');
            continue;
        }
        let cur = '';
        let width = 0;
        for (const ch of line) {
            if (width + 1 > cols) {
                out.push(cur);
                cur = ch;
                width = 1;
            }
            else {
                cur += ch;
                width += 1;
            }
        }
        if (cur.length > 0)
            out.push(cur);
    }
    return out;
}
