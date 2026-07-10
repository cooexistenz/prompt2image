/**
 * prompt2image public API.
 *
 *   const { pages, report } = renderPrompt('your prompt', { profile: 'claude' });
 *
 * Returns PNG pages plus an honest token report comparing the image cost
 * against sending the same prompt as plain text.
 */
import { PROFILES } from './profiles.js';
import { renderText } from './render.js';
import { estimateTextTokens, sumImageTokens } from './tokens.js';
export { PageLimitError, renderText } from './render.js';
export { PROFILES, isProfileName } from './profiles.js';
export { estimateTextTokens, estimateImageTokens, anthropicImageTokens, openaiImageTokens, geminiImageTokens, } from './tokens.js';
export { reflow, dereflow, NEWLINE_MARK } from './reflow.js';
export function renderPrompt(prompt, options = {}) {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        throw new Error('prompt must be a non-empty string');
    }
    const { profile, ...overrides } = options;
    const profileName = profile ?? 'claude';
    const base = profile ? PROFILES[profile] : PROFILES.claude;
    const result = renderText(prompt, { ...base, ...overrides });
    const textTokens = estimateTextTokens(prompt);
    const imageTokens = sumImageTokens(result.pages);
    let chars = 0;
    for (const _ of prompt)
        chars++;
    const report = {
        profile: profile ?? (Object.keys(overrides).length > 0 ? 'custom' : profileName),
        pages: result.pages.length,
        pixels: result.pixels,
        bytes: result.bytes,
        chars,
        droppedChars: result.droppedChars,
        droppedSample: result.droppedSample,
        reflowed: result.reflowed,
        textTokens,
        imageTokens,
        savings: {
            anthropic: textTokens - imageTokens.anthropic,
            openai: textTokens - imageTokens.openai,
            gemini: textTokens - imageTokens.gemini,
        },
        cheaperAsImage: {
            anthropic: imageTokens.anthropic < textTokens,
            openai: imageTokens.openai < textTokens,
            gemini: imageTokens.gemini < textTokens,
        },
    };
    return { pages: result.pages, report };
}
