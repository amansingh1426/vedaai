export type ApiErrorCode =
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_API_KEY'
  | 'MISSING_API_KEY'
  | 'TIMEOUT'
  | 'MODEL_ERROR'
  | 'PARSE_ERROR'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: ApiErrorCode;
  statusCode?: number;
  elapsedMs?: number;
  isRateLimit?: boolean;
  isAuthError?: boolean;
  isTimeout?: boolean;
  isParseError?: boolean;
  details?: string;
  raw?: string;
  rawError?: Record<string, any> | string;
}

export class ApiTimeoutError extends Error {
  code: ApiErrorCode = 'TIMEOUT';
  isTimeout = true;
  statusCode = 504;
  elapsedMs: number;

  constructor(
    message = 'Gemini API call timed out after 45 seconds. Please try again.',
    elapsedMs = 45000
  ) {
    super(message);
    this.name = 'ApiTimeoutError';
    this.elapsedMs = elapsedMs;
    // Maintain prototype chain
    Object.setPrototypeOf(this, ApiTimeoutError.prototype);
  }
}

/**
 * Robustly serializes an Error or unknown error object into a clean,
 * plain JSON-serializable object with all non-enumerable properties explicitly extracted.
 */
export function serializeError(err: any): Record<string, any> {
  if (!err) return {};
  if (typeof err === 'string') return { message: err };
  if (typeof err !== 'object') return { value: String(err) };

  // Explicitly extract non-enumerable Error properties
  const serialized: Record<string, any> = {
    name: err?.name || 'Error',
    message: err?.message || String(err),
    stack: err?.stack || undefined,
    status: err?.status ?? err?.statusCode ?? err?.response?.status,
    statusText: err?.statusText ?? err?.response?.statusText,
    code: err?.code,
  };

  // Extract all other enumerable and non-enumerable own properties
  try {
    const allPropNames = new Set([
      ...Object.getOwnPropertyNames(err),
      ...Object.keys(err),
    ]);

    for (const key of allPropNames) {
      if (key === 'stack' || key === 'message' || key === 'name') continue;
      const val = err[key];
      if (typeof val !== 'function') {
        serialized[key] = val;
      }
    }
  } catch {
    // If reflection fails, fallback to basic extracted properties
  }

  // Handle nested error objects e.g. err.error
  if (err.error && typeof err.error === 'object') {
    serialized.errorDetails = {
      message: err.error.message,
      code: err.error.code,
      status: err.error.status,
      details: err.error.details,
    };
  }

  return serialized;
}

/**
 * Wraps an asynchronous promise with a strict timeout (defaults to 45s for large multi-page inputs).
 * If the promise does not resolve/reject within timeoutMs, rejects with ApiTimeoutError.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 45000,
  contextDescription = 'Gemini API call'
): Promise<T> {
  const startTime = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      reject(
        new ApiTimeoutError(
          `${contextDescription} timed out after ${(elapsed / 1000).toFixed(1)}s (timeout threshold: ${Math.round(
            timeoutMs / 1000
          )}s). The model took longer than expected to process large inputs.`,
          elapsed
        )
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Classifies any thrown error (Gemini SDK, network, timeout, JSON parse)
 * into a typed, user-friendly error response object with full raw diagnostics.
 */
export function classifyGeminiError(error: any, elapsedMs?: number): {
  error: string;
  code: ApiErrorCode;
  isRateLimit: boolean;
  isAuthError: boolean;
  isTimeout: boolean;
  isParseError: boolean;
  statusCode: number;
  details: string;
  rawError: Record<string, any>;
} {
  const serialized = serializeError(error);
  const errMsg = serialized.message || String(error || '');
  const errStatus = serialized.status;

  // 1. Timeout detection (either ApiTimeoutError, abort, or 504)
  if (
    error instanceof ApiTimeoutError ||
    error?.isTimeout ||
    error?.code === 'TIMEOUT' ||
    errMsg.toLowerCase().includes('timed out') ||
    errMsg.toLowerCase().includes('timeout')
  ) {
    const durationStr = elapsedMs ? ` after ${(elapsedMs / 1000).toFixed(1)}s` : '';
    return {
      error: `Gemini request timed out${durationStr} (limit: 45s). The service may be busy or input image processing took too long.`,
      code: 'TIMEOUT',
      isRateLimit: false,
      isAuthError: false,
      isTimeout: true,
      isParseError: false,
      statusCode: 504,
      details: errMsg || 'Operation exceeded timeout threshold of 45 seconds.',
      rawError: serialized,
    };
  }

  // 2. Missing API Key
  if (error?.code === 'MISSING_API_KEY' || errMsg.includes('GEMINI_API_KEY') || errMsg.includes('missing API Key')) {
    return {
      error: 'Gemini API Key is missing. Please configure GEMINI_API_KEY in your .env.local file.',
      code: 'MISSING_API_KEY',
      isRateLimit: false,
      isAuthError: true,
      isTimeout: false,
      isParseError: false,
      statusCode: 500,
      details: errMsg,
      rawError: serialized,
    };
  }

  // 3. Invalid, Expired, or Unauthorized API Key (400 invalid key, 401, 403)
  if (
    (errStatus === 400 && (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid') || errMsg.includes('API_KEY'))) ||
    errStatus === 401 ||
    errStatus === 403 ||
    errMsg.includes('API_KEY_INVALID') ||
    errMsg.includes('API key not valid') ||
    errMsg.includes('API key expired') ||
    errMsg.includes('PERMISSION_DENIED') ||
    errMsg.includes('CONSUMER_INVALID') ||
    errMsg.includes('UNAUTHENTICATED')
  ) {
    return {
      error: `Invalid or expired Gemini API key (HTTP ${errStatus || 401}). Please check GEMINI_API_KEY in .env.local.`,
      code: 'INVALID_API_KEY',
      isRateLimit: false,
      isAuthError: true,
      isTimeout: false,
      isParseError: false,
      statusCode: typeof errStatus === 'number' ? errStatus : 401,
      details: errMsg,
      rawError: serialized,
    };
  }

  // 4. Rate Limit / Quota Exceeded (429 / RESOURCE_EXHAUSTED)
  if (
    errStatus === 429 ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('429') ||
    errMsg.toLowerCase().includes('rate limit') ||
    errMsg.toLowerCase().includes('quota') ||
    errMsg.toLowerCase().includes('too many requests')
  ) {
    return {
      error: 'Gemini API rate limit or quota exceeded (HTTP 429). Please wait ~30-60 seconds before retrying.',
      code: 'RATE_LIMIT_EXCEEDED',
      isRateLimit: true,
      isAuthError: false,
      isTimeout: false,
      isParseError: false,
      statusCode: 429,
      details: errMsg,
      rawError: serialized,
    };
  }

  // 5. JSON Parsing / Response Structure Failure
  if (
    error?.code === 'PARSE_ERROR' ||
    errMsg.toLowerCase().includes('json') ||
    errMsg.toLowerCase().includes('unexpected token') ||
    errMsg.toLowerCase().includes('parsed json structure')
  ) {
    return {
      error: 'Failed to parse structured JSON from Gemini response.',
      code: 'PARSE_ERROR',
      isRateLimit: false,
      isAuthError: false,
      isTimeout: false,
      isParseError: true,
      statusCode: 502,
      details: errMsg,
      rawError: serialized,
    };
  }

  // 6. Generic / Model / Upstream Error (404 Model Not Found, 500, 503)
  return {
    error: errMsg || `Gemini API call failed with status ${errStatus || 500}.`,
    code: errStatus === 404 ? 'MODEL_ERROR' : 'INTERNAL_ERROR',
    isRateLimit: false,
    isAuthError: false,
    isTimeout: false,
    isParseError: false,
    statusCode: typeof errStatus === 'number' && errStatus >= 400 && errStatus <= 599 ? errStatus : 500,
    details: errMsg || 'An unexpected error occurred while communicating with Gemini API.',
    rawError: serialized,
  };
}
