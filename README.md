# Prompt2Image

**Turn any text prompt into a compact, machine-readable PNG — with honest, per-provider token accounting.**

Prompt2Image renders text into dense bitmap-font pages tuned to how each AI
provider resamples and bills images. Every render returns the math both ways:
what the prompt costs as pixels vs. what it costs as plain text — including
when plain text wins and you shouldn't use an image at all.

```
6-line prompt, 220 chars  ──►  one 908×27 px PNG  ──►  ≈33 tokens on Claude (vs ≈55 as text)
```

- **Library** — `renderPrompt(text, { profile })` returns PNG pages + a token report
- **REST API** — stateless `POST /render`, returns PNG or JSON with base64 pages
- **CLI** — `prompt2image "text" -o out.png --profile claude`
- **Dashboard** — a playground at `/app` with live token-cost comparison
- **Zero runtime dependencies** — the PNG encoder, font atlas, and server are all in-tree

## Quick start

```bash
git clone https://github.com/cooexistenz/prompt2image
cd prompt2image
npm start              # playground on http://127.0.0.1:8018 — no npm install needed
```

The compiled `dist/` ships in the repo and there are zero runtime
dependencies, so running the server, CLI, and dashboard requires nothing but
Node 18+. `npm install` is only needed for *development* (TypeScript,
tests). Note for older Macs (macOS 11 and earlier): the test runner's
toolchain (vitest → esbuild) ships binaries built for macOS 12+, so
`npm install` may fail there — running the tool itself is unaffected.

Render a prompt:

```bash
curl -s http://127.0.0.1:8018/render \
  -H "content-type: application/json" \
  -H "accept: image/png" \
  -d '{"prompt": "Summarize the attached report in German.", "profile": "claude"}' \
  -o prompt.png
```

Or from code:

```ts
import { renderPrompt } from 'prompt2image';

const { pages, report } = renderPrompt('Your prompt here', { profile: 'claude' });
// report.textTokens, report.imageTokens.{anthropic,openai,gemini}, report.cheaperAsImage
```

## How it works

An image's token cost is set by its pixel dimensions, not by how much text it
contains. Prompt2Image renders each character as a tiny bitmap glyph (5×8 px in
dense mode), packs line breaks into visible `↵` marks so no pixel row is
wasted, and sizes pages to each provider's billing grid:

| Profile  | Glyph | Page geometry | Why |
|----------|-------|---------------|-----|
| `claude` | 5×8   | ≤1568×728 px  | Claude fits images within a 1568 px long edge and ~1.15 MP before billing ≈ pixels÷750 — this shape reaches the model unresampled |
| `openai` | 8×16  | ≤1528×768 px  | GPT bills 85 + 170 per 512 px tile after resizing; larger glyphs survive the resample |
| `gemini` | 8×16  | ≤768×768 px   | Gemini bills 258 tokens per 768 px tile — one page, one tile |
| `ocr`    | 16×32 | generous margins, real line breaks | Tuned for Tesseract/EasyOCR/PaddleOCR, not token count |

Every response includes the estimate for all three providers next to the
plain-text estimate, so the decision is made with numbers.

## The honest part

Rendering text as pixels is a trade, not magic:

- **Vision models don't run OCR.** They read images through patch embeddings.
  Dense renders read remarkably well on the strongest current models, but
  exact strings (IDs, hashes, long numbers) can be *silently* misread. Keep
  byte-critical values in plain text, or use `embedOriginal` (below).
- **Sometimes text is cheaper.** Tile-billed providers have fixed minimum
  image costs; short prompts lose money there. The report flags this per
  render (`cheaperAsImage`) instead of pretending otherwise.
- **Readability differs by model.** Test the dense profile against your
  target model before relying on it. Use `ocr` when a classic OCR engine is
  the reader.
- **Transparent backgrounds are opt-in, not default.** Alpha is flattened
  unpredictably downstream (often onto black) and OCR engines binarize badly
  against it. The default is opaque white with pure black ink.

## Lossless recovery

Two mechanisms:

1. **Visible structure** — hard newlines render as `↵`, tabs as `→`, so the
   original layout reconstructs from the image itself.
2. **`embedOriginal: true`** — the exact prompt string ships inside the PNG as
   an `iTXt` metadata chunk. Byte-perfect, zero visual cost.

## API

### `POST /render`

```jsonc
{
  "prompt": "required, non-empty string",
  "profile": "claude | openai | gemini | ocr",     // optional, default claude
  "options": {                                      // all optional
    "background": "white | transparent",
    "banner": true,           // in-image reader header (default text: "user prompt")
    "bannerText": "user prompt",  // custom header wording, ≤200 chars
    "reflow": true,           // ↵ line packing
    "embedOriginal": false,   // iTXt metadata
    "scale": 1, "maxCols": 312, "maxHeightPx": 728, "maxPages": 8,
    "padX": 4, "padY": 4, "lineGap": 0, "atlas": "dense | large"
  }
}
```

- `Accept: image/png` → the page as a PNG stream (422 if the render paginates)
- otherwise → JSON `{ pages: [{ width, height, png: base64 }], report }`

Report headers on every response: `x-p2i-text-tokens`,
`x-p2i-image-tokens-anthropic|openai|gemini`, `x-p2i-pages`,
`x-p2i-dropped-chars`, `x-p2i-render-ms`.

Other routes: `GET /healthz`, `GET /` (landing), `GET /app` (playground).

Environment: `PORT` (8018), `P2I_MAX_BODY_BYTES` (1 MiB),
`P2I_RATE_LIMIT` (120/min per IP, 0 disables), `P2I_CORS_ORIGIN` (unset = off).

### CLI

```bash
prompt2image "Translate this to English: ..." -o out.png --profile claude
cat prompt.txt | prompt2image --stdin --profile ocr --json
```

## Privacy

Privacy is architectural, not a policy promise: prompts are rendered entirely
in memory, returned, and garbage-collected. No database, no cache, no prompt
logging — access logs carry byte counts and timings only. It's open source;
verify instead of trusting.

If you expose a public instance, put it behind a reverse proxy with auth —
a free text-to-clean-PNG endpoint is attractive to spammers.

## Character coverage

Printable ASCII plus Western European Latin (umlauts, ß, accents, €) in dense
mode; 1,000+ glyphs in the large atlas. Codepoints outside coverage are never
silently mangled — they render as blank cells and are counted in
`report.droppedChars` with samples in `report.droppedSample`. CJK is not yet
supported.

## Development

```bash
npm install
npm test               # vitest: unit + API e2e
npm run typecheck
npm run gen:atlas      # regenerate src/core/atlas-data.ts from assets/fonts
npm run build && npm start
```

## License

MIT. Bundled glyphs derive from the Spleen bitmap font (BSD-2-Clause) — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
