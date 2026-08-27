import { serializeError } from './apiHelper';

/**
 * Centralized Gemini Model Configuration
 * 
 * Confirmed standard models:
 * - gemini-2.5-flash (Primary)
 * - gemini-2.5-flash-lite (Fallback 1)
 * - gemini-flash-latest (Fallback 2)
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const GEMINI_CANDIDATE_MODELS: readonly string[] = Object.freeze(
  [
    GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
  ].filter((val, idx, self) => self.indexOf(val) === idx)
);

/**
 * Helper to execute a Gemini model call with automatic fallback across confirmed valid models.
 * Includes upfront sanity logging before each call.
 */
export async function callGeminiWithFallback<T>(
  actionName: string,
  fn: (modelName: string) => Promise<T>,
  models: readonly string[] = GEMINI_CANDIDATE_MODELS
): Promise<T> {
  let lastErr: any = null;

  for (const model of models) {
    console.log(`[VedaAI Sanity Check] 🚀 Attempting Gemini call for "${actionName}" with model: "${model}"`);
    try {
      const result = await fn(model);
      console.log(`[VedaAI Model Success] ✓ Successfully completed "${actionName}" using model: "${model}"`);
      return result;
    } catch (err: any) {
      lastErr = err;
      const serialized = serializeError(err);
      console.error(`[VedaAI Raw Gemini Error on model "${model}" during "${actionName}"]:`, serialized);

      const errMsg = String(err?.message || '');
      const isNotFound = errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('is no longer available');
      const isUnavailable = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE');

      if (isNotFound || isUnavailable) {
        console.warn(`[VedaAI Model Fallback] Model "${model}" returned ${isNotFound ? '404' : '503'}. Trying next model in fallback list...`);
        continue;
      }

      // For rate limits (429), auth errors (401/403), or other errors, re-throw immediately to surface correctly
      throw err;
    }
  }

  throw lastErr;
}
