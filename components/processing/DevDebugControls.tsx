'use client';

import React, { useState } from 'react';
import { 
  Bug, 
  Clock, 
  AlertTriangle, 
  Key, 
  ChevronDown, 
  ChevronUp, 
  RotateCcw,
  ZapOff
} from 'lucide-react';

export type SimulatedErrorType = 'server_error' | 'timeout' | 'rate_limit' | 'invalid_key';

interface DevDebugControlsProps {
  onSimulateStageError: (stage: 1 | 2 | 3, type: SimulatedErrorType) => void;
  onResetPipeline?: () => void;
}

/**
 * DEV-ONLY DEBUG CONTROLS
 * REMINDER: This component is only rendered when process.env.NODE_ENV === 'development'.
 * Remove or disable before production deployment.
 */
export const DevDebugControls: React.FC<DevDebugControlsProps> = ({
  onSimulateStageError,
  onResetPipeline,
}) => {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-6 rounded-2xl border-2 border-dashed border-amber-400/80 dark:border-amber-600/80 bg-amber-50/50 dark:bg-amber-950/20 p-4 shadow-sm animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white font-bold shadow-xs">
            <Bug className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-mono">
                DEV ONLY
              </span>
              <h4 className="text-xs font-bold text-slate-900 dark:text-amber-100">
                Pipeline Failure &amp; Timeout Simulators
              </h4>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Simulate stage errors and 45s+ timeouts without modifying .env.local or disconnecting the network.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-amber-200/50 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
          title={isOpen ? 'Collapse Dev Controls' : 'Expand Dev Controls'}
        >
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 pt-3 border-t border-amber-200/80 dark:border-amber-800/60 space-y-3">
          {/* Main Stage Failure Buttons */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2 font-mono">
              Stage 500 Failure Triggers
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onSimulateStageError(1, 'server_error')}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-100/80 hover:bg-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 border border-rose-300 dark:border-rose-800 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                <ZapOff className="h-3.5 w-3.5" />
                Force Stage 1 Failure
              </button>

              <button
                type="button"
                onClick={() => onSimulateStageError(2, 'server_error')}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-100/80 hover:bg-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 border border-rose-300 dark:border-rose-800 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                <ZapOff className="h-3.5 w-3.5" />
                Force Stage 2 Failure
              </button>

              <button
                type="button"
                onClick={() => onSimulateStageError(3, 'server_error')}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-100/80 hover:bg-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 border border-rose-300 dark:border-rose-800 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                <ZapOff className="h-3.5 w-3.5" />
                Force Stage 3 Failure
              </button>
            </div>
          </div>

          {/* Specific Failure Mode Simulators */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2 font-mono">
              Specific Gemini Error Mode Simulators
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onSimulateStageError(1, 'timeout')}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-100/80 hover:bg-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-300 dark:border-blue-800 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                <Clock className="h-3.5 w-3.5" />
                Force Timeout (45s+)
              </button>

              <button
                type="button"
                onClick={() => onSimulateStageError(2, 'rate_limit')}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/90 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-700 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Force 429 Rate Limit
              </button>

              <button
                type="button"
                onClick={() => onSimulateStageError(1, 'invalid_key')}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-100/80 hover:bg-purple-200 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 border border-purple-300 dark:border-purple-800 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                <Key className="h-3.5 w-3.5" />
                Force Invalid API Key
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            <span>
              💡 After triggering a simulation, test clicking <strong>&quot;Retry Stage X Only&quot;</strong> or <strong>&quot;Try Stage X Again&quot;</strong>.
            </span>
            {onResetPipeline && (
              <button
                type="button"
                onClick={onResetPipeline}
                className="flex items-center gap-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white font-medium cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Pipeline
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
