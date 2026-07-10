/**
 * Core renderer: text → one or more black-on-white (or transparent) PNG pages.
 * Layout is a fixed character grid — each codepoint occupies one atlas cell,
 * scaled by an integer factor. Pages are sized to stay under provider resample
 * caps so every billed pixel actually reaches the vision encoder.
 */
import { getAtlas } from './atlas.js';
import { encodeGrayAlphaPng, encodeGrayPng } from './png.js';
import { NEWLINE_MARK, reflow } from './reflow.js';
import { contentCols, minifyText, wrapLines } from './wrap.js';
export class PageLimitError extends Error {
    pagesNeeded;
    maxPages;
    constructor(pagesNeeded, maxPages) {
        super(`prompt needs ${pagesNeeded} pages but maxPages is ${maxPages}`);
        this.pagesNeeded = pagesNeeded;
        this.maxPages = maxPages;
        this.name = 'PageLimitError';
    }
}
const DEFAULTS = {
    atlas: 'dense',
    scale: 1,
    maxCols: 312,
    minCols: 40,
    maxHeightPx: 728,
    maxPages: 8,
    reflow: true,
    banner: true,
    background: 'white',
    padX: 4,
    padY: 4,
    lineGap: 0,
    embedOriginal: false,
};
function bannerText(page, total, reflowed) {
    const parts = [`TEXT PAGE ${page}/${total}`, 'read row by row'];
    if (reflowed)
        parts.push(`${NEWLINE_MARK} = line break`);
    return parts.join('  |  ');
}
/** Blit one glyph into the grayscale framebuffer at pixel (x0, y0). */
function blit(fb, fbW, atlas, off, x0, y0, scale) {
    for (let gy = 0; gy < atlas.cellH; gy++) {
        for (let gx = 0; gx < atlas.cellW; gx++) {
            if (!atlas.pixelAt(off, gx, gy))
                continue;
            for (let sy = 0; sy < scale; sy++) {
                const row = (y0 + gy * scale + sy) * fbW;
                for (let sx = 0; sx < scale; sx++) {
                    fb[row + x0 + gx * scale + sx] = 0;
                }
            }
        }
    }
}
export function renderText(text, options = {}) {
    const opt = { ...DEFAULTS, ...options };
    if (text.length === 0)
        throw new Error('empty text');
    const atlas = getAtlas(opt.atlas);
    const scale = Math.max(1, Math.floor(opt.scale));
    let source = text;
    let reflowed = false;
    if (opt.reflow) {
        const packed = reflow(text);
        if (packed !== null) {
            source = packed;
            reflowed = true;
        }
        else {
            source = minifyText(text);
        }
    }
    else {
        source = minifyText(text);
    }
    const cols = Math.max(opt.minCols, contentCols(source, Math.max(1, opt.maxCols)));
    const lines = wrapLines(source, cols);
    const cellW = atlas.cellW * scale;
    const cellH = atlas.cellH * scale + opt.lineGap;
    const bannerRows = opt.banner ? atlas.cellH * scale + opt.lineGap + 3 : 0; // banner line + 1px rule + 2px gap
    const linesPerPage = Math.max(1, Math.floor((opt.maxHeightPx - 2 * opt.padY - bannerRows) / cellH));
    const totalPages = Math.max(1, Math.ceil(lines.length / linesPerPage));
    if (totalPages > opt.maxPages)
        throw new PageLimitError(totalPages, opt.maxPages);
    const width = 2 * opt.padX + cols * cellW;
    const pages = [];
    let pixels = 0;
    let bytes = 0;
    let droppedChars = 0;
    const droppedSet = new Set();
    for (let p = 0; p < totalPages; p++) {
        const pageLines = lines.slice(p * linesPerPage, (p + 1) * linesPerPage);
        const height = 2 * opt.padY + bannerRows + pageLines.length * cellH;
        const fb = new Uint8Array(width * height).fill(255);
        let y = opt.padY;
        if (opt.banner) {
            const label = bannerText(p + 1, totalPages, reflowed);
            let x = opt.padX;
            for (const ch of label) {
                if (x + cellW > width - opt.padX)
                    break;
                const off = atlas.offsetOf(ch.codePointAt(0));
                if (off >= 0)
                    blit(fb, width, atlas, off, x, y, scale);
                x += cellW;
            }
            const ruleY = y + atlas.cellH * scale + opt.lineGap + 1;
            for (let rx = opt.padX; rx < width - opt.padX; rx++)
                fb[ruleY * width + rx] = 140;
            y += bannerRows;
        }
        for (const line of pageLines) {
            let x = opt.padX;
            let col = 0;
            for (const ch of line) {
                if (col >= cols)
                    break;
                const off = atlas.offsetOf(ch.codePointAt(0));
                if (off >= 0) {
                    blit(fb, width, atlas, off, x, y, scale);
                }
                else {
                    droppedChars++;
                    if (droppedSet.size < 8)
                        droppedSet.add(ch);
                }
                x += cellW;
                col++;
            }
            y += cellH;
        }
        const pngOpts = opt.embedOriginal && p === 0 ? { embeddedText: { keyword: 'prompt', text } } : {};
        let png;
        if (opt.background === 'transparent') {
            // Ink stays black; alpha carries the coverage (background fully clear).
            const ga = new Uint8Array(width * height * 2);
            for (let i = 0; i < fb.length; i++) {
                ga[i * 2] = 0;
                ga[i * 2 + 1] = 255 - fb[i];
            }
            png = encodeGrayAlphaPng(ga, width, height, pngOpts);
        }
        else {
            png = encodeGrayPng(fb, width, height, pngOpts);
        }
        pages.push({ png, width, height });
        pixels += width * height;
        bytes += png.length;
    }
    return { pages, pixels, bytes, droppedChars, droppedSample: [...droppedSet], reflowed };
}
