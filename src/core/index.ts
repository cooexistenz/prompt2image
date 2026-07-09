/**
 * prompt2image public API.
 *
 *   const { pages, report } = renderPrompt('your prompt', { profile: 'claude' });
 *
 * Returns PNG pages plus an honest token report comparing the image cost
 * against sending the same prompt as plain text.
 */
import { PROFILES, isProfileName, type ProfileName } from './profiles.js';
import { PageLimitError, renderText, type RenderOptions, type RenderedPage } from './render.js';
import { estimateTextTokens, sumImageTokens, type ImageTokenEstimates } from './tokens.js';

export { PageLimitError, renderText } from './render.js';
export type { RenderOptions, RenderResult, RenderedPage } from './render.js';
export { PROFILES, isProfileName } from './profiles.js';
export type { ProfileName } from './profiles.js';
export {
  estimateTextTokens,
  estimateImageTokens,
  anthropicImageTokens,
  openaiImageTokens,
  geminiImageTokens,
} from './tokens.js';
export type { ImageTokenEstimates } from './tokens.js';
export { reflow, dereflow, NEWLINE_MARK } from './reflow.js';

export interface RenderPromptOptions extends RenderOptions {
  profile?: ProfileName;
}

export interface TokenReport {
  readonly profile: ProfileName | 'custom';
  readonly pages: number;
  readonly pixels: number;
  readonly bytes: number;
  readonly chars: number;
  readonly droppedChars: number;
  readonly droppedSample: string[];
  readonly reflowed: boolean;
  /** Estimated tokens if the prompt were sent as plain text. */
  readonly textTokens: number;
  /** Estimated tokens for the rendered pages, per provider. */
  readonly imageTokens: ImageTokenEstimates;
  /** textTokens − imageTokens per provider (positive = the image is cheaper). */
  readonly savings: ImageTokenEstimates;
  /** Providers for which the image render costs fewer tokens than the text. */
  readonly cheaperAsImage: { anthropic: boolean; openai: boolean; gemini: boolean };
}

export interface RenderPromptResult {
  readonly pages: RenderedPage[];
  readonly report: TokenReport;
}

export function renderPrompt(prompt: string, options: RenderPromptOptions = {}): RenderPromptResult {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('prompt must be a non-empty string');
  }
  const { profile, ...overrides } = options;
  const profileName: ProfileName | 'custom' = profile ?? 'claude';
  const base = profile ? PROFILES[profile] : PROFILES.claude;
  const result = renderText(prompt, { ...base, ...overrides });

  const textTokens = estimateTextTokens(prompt);
  const imageTokens = sumImageTokens(result.pages);
  let chars = 0;
  for (const _ of prompt) chars++;

  const report: TokenReport = {
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
