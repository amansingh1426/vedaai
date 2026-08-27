'use client';

import React from 'react';
import { AlertOctagon, Key, RefreshCw, X, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiErrorCode } from '@/lib/apiHelper';

export interface GeminiErrorInfo {
  type: 'rate-limit' | 'api-key' | 'timeout' | 'generic';
  title: string;
  message: string;
  code?: ApiErrorCode | string;
  details?: string;
  stageNumber?: number;
}

interface GeminiErrorBannerProps {
  error: GeminiErrorInfo | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  isRetrying?: boolean;
}

export const GeminiErrorBanner: React.FC<GeminiErrorBannerProps> = ({
  error,
  onRetry,
  onDismiss,
  isRetrying = false,
}) => {
  if (!error) return null;

  const isRateLimit = error.type === 'rate-limit' || error.code === 'RATE_LIMIT_EXCEEDED';
  const isApiKey = error.type === 'api-key' || error.code === 'INVALID_API_KEY' || error.code === 'MISSING_API_KEY';
  const isTimeout = error.type === 'timeout' || error.code === 'TIMEOUT';

  return (
    <div
      role="alert"
      className={clsx(
        'mb-6 p-4 sm:p-5 rounded-2xl border shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-300 transition-all relative overflow-hidden',
        isRateLimit && 'bg-amber-500/10 dark:bg-amber-950/40 border-amber-400/60 dark:border-amber-600/60 text-amber-950 dark:text-amber-100',
        isApiKey && 'bg-rose-500/10 dark:bg-rose-950/40 border-rose-400/60 dark:border-rose-600/60 text-rose-950 dark:text-rose-100',
        isTimeout && 'bg-blue-500/10 dark:bg-blue-950/40 border-blue-400/60 dark:border-blue-600/60 text-blue-950 dark:text-blue-100',
        !isRateLimit && !isApiKey && !isTimeout && 'bg-slate-900/10 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100'
      )}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          {/* Icon */}
          <div
            className={clsx(
              'p-2.5 rounded-xl shrink-0 shadow-sm mt-0.5',
              isRateLimit && 'bg-amber-500 text-white',
              isApiKey && 'bg-rose-600 text-white',
              isTimeout && 'bg-blue-600 text-white',
              !isRateLimit && !isApiKey && !isTimeout && 'bg-slate-700 text-white'
            )}
          >
            {isRateLimit && <AlertTriangle className="h-5 w-5" />}
            {isApiKey && <Key className="h-5 w-5" />}
            {isTimeout && <Clock className="h-5 w-5" />}
            {!isRateLimit && !isApiKey && !isTimeout && <AlertOctagon className="h-5 w-5" />}
          </div>

          {/* Text Content */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={clsx(
                  'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border font-mono',
                  isRateLimit && 'bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
                  isApiKey && 'bg-rose-100 dark:bg-rose-900/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700',
                  isTimeout && 'bg-blue-100 dark:bg-blue-900/80 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700',
                  !isRateLimit && !isApiKey && !isTimeout && 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                )}
              >
                {isRateLimit ? '429 Rate Limit / Quota' : isApiKey ? 'API Key Error' : isTimeout ? 'Request Timeout (30s)' : 'Pipeline Error'}
              </span>

              {error.stageNumber && (
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Stage {error.stageNumber} Failed
                </span>
              )}
            </div>

            <h4 className="text-sm sm:text-base font-bold leading-snug">
              {error.title}
            </h4>

            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-3xl">
              {error.message}
            </p>

            {isApiKey && (
              <div className="mt-2 text-xs font-mono bg-white/70 dark:bg-black/40 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 select-all">
                GEMINI_API_KEY=AIzaSy... in .env.local
              </div>
            )}

            {isRateLimit && (
              <p className="text-[11px] text-amber-800 dark:text-amber-300/90 font-medium">
                Tip: Free tier Gemini accounts allow 15 RPM. Wait ~30 seconds and click &quot;Retry Stage&quot; below.
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto justify-end">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
                isRateLimit && 'bg-amber-600 hover:bg-amber-700',
                isApiKey && 'bg-rose-600 hover:bg-rose-700',
                isTimeout && 'bg-blue-600 hover:bg-blue-700',
                !isRateLimit && !isApiKey && !isTimeout && 'bg-indigo-600 hover:bg-indigo-700'
              )}
            >
              <RefreshCw className={clsx('h-3.5 w-3.5', isRetrying && 'animate-spin')} />
              <span>{isRetrying ? 'Retrying...' : error.stageNumber ? `Retry Stage ${error.stageNumber}` : 'Retry Stage'}</span>
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
