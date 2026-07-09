/**
 * Glyph atlas generator: parses BDF bitmap fonts into bit-packed atlases and
 * emits src/core/atlas-data.ts. Runs at development time only; the generated
 * module is committed so consumers need no build step or native deps.
 *
 * BDF is a plain-text format: one STARTCHAR..ENDCHAR block per glyph, bitmap
 * rows as MSB-first hex. We normalize every glyph into a fixed cell
 * (FONTBOUNDINGBOX) so the renderer can blit by (codepoint, row) alone.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Parse one .bdf file into { cellW, cellH, glyphs: Map<codepoint, Uint8Array> }. */
function parseBdf(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  let fbb = null; // [w, h, xoff, yoff]
  const glyphs = new Map();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('FONTBOUNDINGBOX')) {
      fbb = line.split(/\s+/).slice(1, 5).map(Number);
    } else if (line.startsWith('STARTCHAR')) {
      let encoding = -1;
      let bbx = null;
      const rows = [];
      i++;
      for (; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l.startsWith('ENCODING')) encoding = Number(l.split(/\s+/)[1]);
        else if (l.startsWith('BBX')) bbx = l.split(/\s+/).slice(1, 5).map(Number);
        else if (l === 'BITMAP') {
          for (i++; i < lines.length && lines[i].trim() !== 'ENDCHAR'; i++) {
            rows.push(lines[i].trim());
          }
          break;
        } else if (l === 'ENDCHAR') break;
      }
      if (encoding >= 0 && bbx && fbb) {
        glyphs.set(encoding, normalizeGlyph(rows, bbx, fbb));
      }
    }
    i++;
  }
  if (!fbb) throw new Error(`no FONTBOUNDINGBOX in ${path}`);
  return { cellW: fbb[0], cellH: fbb[1], glyphs };
}

/**
 * Place a BBX-sized bitmap into the full font cell. BDF coordinates are
 * baseline-relative: a box of height h with y-offset yoff spans rows
 * [yoff, yoff+h) above the baseline. The cell's top row sits at
 * (fbbH + fbbYoff) above the baseline.
 */
function normalizeGlyph(hexRows, bbx, fbb) {
  const [bw, bh, bx, by] = bbx;
  const [fw, fh, fx, fy] = fbb;
  const bytesPerRow = Math.ceil(fw / 8);
  const out = new Uint8Array(fh * bytesPerRow);
  const topPad = fh + fy - (bh + by); // rows of empty cell above the glyph box
  const srcBytes = Math.ceil(bw / 8);
  for (let r = 0; r < bh; r++) {
    const destRow = topPad + r;
    if (destRow < 0 || destRow >= fh) continue;
    const hex = hexRows[r] ?? '';
    let bits = 0n;
    for (let b = 0; b < srcBytes; b++) {
      bits = (bits << 8n) | BigInt(parseInt(hex.slice(b * 2, b * 2 + 2) || '00', 16));
    }
    // bits now holds the row MSB-first over srcBytes*8 positions; pixel p of
    // the box is bit (srcBytes*8 - 1 - p). Shift into the cell at x = bx - fx.
    const shift = bx - fx;
    for (let p = 0; p < bw; p++) {
      const on = (bits >> BigInt(srcBytes * 8 - 1 - p)) & 1n;
      if (on === 0n) continue;
      const x = shift + p;
      if (x < 0 || x >= fw) continue;
      out[destRow * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

/** Build a glyph bitmap from ASCII art rows ('#' = ink). */
function drawGlyph(art, cellW, cellH) {
  const bytesPerRow = Math.ceil(cellW / 8);
  const out = new Uint8Array(cellH * bytesPerRow);
  art.forEach((row, r) => {
    for (let x = 0; x < Math.min(row.length, cellW); x++) {
      if (row[x] === '#') out[r * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  });
  return out;
}

// Marker glyphs the renderer depends on. U+21B5 (↵, hard-newline sentinel) is
// absent from Spleen at every size; U+2192 (→, tab marker) is absent at 5x8.
const EXTRA_5X8 = new Map([
  [0x21b5, drawGlyph(['', '....#', '....#', '..#.#', '.#..#', '#####', '.#...', '..#..'], 5, 8)],
  [0x2192, drawGlyph(['', '', '..#..', '...#.', '#####', '...#.', '..#..'], 5, 8)],
  [0x20ac, drawGlyph(['', '.###.', '#...#', '###..', '#....', '###..', '#...#', '.###.'], 5, 8)],
]);
const EXTRA_8X16 = new Map([
  [
    0x21b5,
    drawGlyph(
      ['', '', '', '......#.', '......#.', '......#.', '......#.', '..#...#.', '.#....#.', '######.', '.#......', '..#.....'],
      8,
      16,
    ),
  ],
]);

function buildAtlas(name, parsed, extras) {
  const { cellW, cellH, glyphs } = parsed;
  for (const [cp, bitmap] of extras) {
    if (!glyphs.has(cp)) glyphs.set(cp, bitmap);
  }
  const codepoints = [...glyphs.keys()].sort((a, b) => a - b);
  const bytesPerRow = Math.ceil(cellW / 8);
  const all = new Uint8Array(codepoints.length * cellH * bytesPerRow);
  codepoints.forEach((cp, i) => all.set(glyphs.get(cp), i * cellH * bytesPerRow));
  const b64 = Buffer.from(all).toString('base64');
  console.log(`${name}: ${codepoints.length} glyphs, cell ${cellW}x${cellH}, ${Math.round(b64.length / 1024)} KiB base64`);
  return { cellW, cellH, codepoints, b64 };
}

const dense = buildAtlas('dense (spleen-5x8)', parseBdf(join(root, 'assets/fonts/spleen-5x8.bdf')), EXTRA_5X8);
const large = buildAtlas('large (spleen-8x16)', parseBdf(join(root, 'assets/fonts/spleen-8x16.bdf')), EXTRA_8X16);

const emit = (a) =>
  `{\n  cellW: ${a.cellW},\n  cellH: ${a.cellH},\n  codepoints: [${a.codepoints.join(',')}],\n  bitmapsBase64:\n    '${a.b64}',\n}`;

writeFileSync(
  join(root, 'src/core/atlas-data.ts'),
  `// GENERATED by scripts/gen-atlas.mjs — do not edit by hand.
// Glyph source: Spleen bitmap font (BSD-2-Clause), see THIRD_PARTY_NOTICES.md.
// Marker glyphs U+21B5/U+2192 are original additions where the font lacks them.

export interface AtlasData {
  readonly cellW: number;
  readonly cellH: number;
  /** Sorted codepoints; glyph i's bitmap starts at i * cellH * ceil(cellW/8). */
  readonly codepoints: number[];
  readonly bitmapsBase64: string;
}

export const DENSE_ATLAS_DATA: AtlasData = ${emit(dense)};

export const LARGE_ATLAS_DATA: AtlasData = ${emit(large)};
`,
);
console.log('wrote src/core/atlas-data.ts');
