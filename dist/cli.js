/**
 * CLI: prompt2image [text] [-o out.png] [--profile claude|openai|gemini|ocr]
 *                   [--stdin] [--json] [--transparent] [--no-banner]
 *                   [--no-reflow] [--embed] [--scale N] [--max-pages N]
 *
 * Multi-page renders write out-1.png, out-2.png, … The token report prints to
 * stderr (stdout stays clean for --json piping).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { isProfileName, renderPrompt } from './core/index.js';
const HELP = `prompt2image — render a text prompt to a compact, machine-readable PNG

Usage:
  prompt2image "your prompt text" [options]
  cat prompt.txt | prompt2image --stdin [options]

Options:
  -o, --out <file>      Output PNG path (default: prompt.png; multi-page → -1, -2, …)
  -p, --profile <name>  claude | openai | gemini | ocr   (default: claude)
      --stdin           Read the prompt from stdin
      --json            Print the full token report as JSON on stdout
      --transparent     Transparent background instead of white
      --no-banner       Skip the in-image reader banner
      --no-reflow       Keep real line breaks instead of ↵-packed rows
      --embed           Embed the original prompt losslessly as PNG metadata
      --scale <n>       Integer glyph scale (default per profile)
      --max-pages <n>   Page cap (default 8)
  -h, --help            Show this help
`;
function fail(msg) {
    console.error(`prompt2image: ${msg}\n`);
    console.error(HELP);
    process.exit(2);
}
const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
    console.log(HELP);
    process.exit(0);
}
let promptText = '';
let out = 'prompt.png';
let asJson = false;
const opts = {};
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
        case '-o':
        case '--out':
            out = args[++i] ?? fail('missing value for --out');
            break;
        case '-p':
        case '--profile': {
            const p = args[++i] ?? fail('missing value for --profile');
            if (!isProfileName(p))
                fail(`unknown profile "${p}"`);
            opts.profile = p;
            break;
        }
        case '--stdin':
            promptText = readFileSync(0, 'utf8');
            break;
        case '--json':
            asJson = true;
            break;
        case '--transparent':
            opts.background = 'transparent';
            break;
        case '--no-banner':
            opts.banner = false;
            break;
        case '--no-reflow':
            opts.reflow = false;
            break;
        case '--embed':
            opts.embedOriginal = true;
            break;
        case '--scale':
            opts.scale = Number(args[++i] ?? fail('missing value for --scale'));
            break;
        case '--max-pages':
            opts.maxPages = Number(args[++i] ?? fail('missing value for --max-pages'));
            break;
        default:
            if (a.startsWith('-'))
                fail(`unknown option "${a}"`);
            promptText = promptText ? `${promptText} ${a}` : a;
    }
}
if (!promptText.trim())
    fail('no prompt given (pass text as an argument or use --stdin)');
try {
    const { pages, report } = renderPrompt(promptText, opts);
    const files = [];
    if (pages.length === 1) {
        writeFileSync(out, pages[0].png);
        files.push(out);
    }
    else {
        const stem = out.replace(/\.png$/i, '');
        pages.forEach((p, i) => {
            const f = `${stem}-${i + 1}.png`;
            writeFileSync(f, p.png);
            files.push(f);
        });
    }
    if (asJson) {
        console.log(JSON.stringify({ files, report }, null, 2));
    }
    else {
        const best = Object.entries(report.savings).sort((a, b) => b[1] - a[1])[0];
        console.error([
            `wrote ${files.join(', ')} (${report.pages} page${report.pages > 1 ? 's' : ''}, ${report.pixels.toLocaleString()} px)`,
            `text ≈ ${report.textTokens} tokens | image ≈ anthropic ${report.imageTokens.anthropic}, openai ${report.imageTokens.openai}, gemini ${report.imageTokens.gemini}`,
            best[1] > 0
                ? `best case: ${best[0]} saves ~${best[1]} tokens vs plain text`
                : `note: plain text is cheaper for this prompt on every provider — image transport costs extra here`,
            report.droppedChars > 0
                ? `warning: ${report.droppedChars} character(s) not covered by the font were dropped: ${report.droppedSample.join(' ')}`
                : '',
        ]
            .filter(Boolean)
            .join('\n'));
    }
}
catch (err) {
    console.error(`prompt2image: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
}
