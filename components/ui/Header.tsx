import React from 'react';
import { BookOpen, GraduationCap, School, Sparkles } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80 transition-all">
      <div className="mx-auto flex max-w-[1600px] w-full items-center justify-between px-8 py-3.5">
        {/* Left: Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Veda<span className="text-indigo-600 dark:text-indigo-400">AI</span>
              </span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Evaluation Suite
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              AI-Powered Spatial Answer Mapping & Grading
            </p>
          </div>
        </div>

        {/* Right: Teacher / School Profile */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Prof. Eleanor Vance
            </span>
            <span className="flex items-center justify-end gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              <School className="h-3 w-3" />
              Oakridge International Academy
            </span>
          </div>

          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 ring-2 ring-indigo-500/20 font-semibold text-xs">
            EV
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
          </div>
        </div>
      </div>
    </header>
  );
};
