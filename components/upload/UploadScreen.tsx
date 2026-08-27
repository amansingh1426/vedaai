'use client';

import React, { useState } from 'react';
import { FileDropzone } from './FileDropzone';
import { 
  ArrowRight, 
  Sparkles, 
  HelpCircle, 
  CheckCircle2, 
  Layers, 
  FileCheck2, 
  AlertTriangle,
  PlayCircle,
  FileQuestion,
  ScanText
} from 'lucide-react';
import { clsx } from 'clsx';

interface UploadScreenProps {
  onStartMapping: (questionFile: File, answerFile: File) => void;
  onLoadSampleData?: () => void;
}

export const UploadScreen: React.FC<UploadScreenProps> = ({
  onStartMapping,
  onLoadSampleData,
}) => {
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);

  const isBothSelected = !!questionFile && !!answerFile;
  const isSameFile = questionFile && answerFile && questionFile.name === answerFile.name && questionFile.size === answerFile.size;

  const handleStart = () => {
    if (questionFile && answerFile) {
      onStartMapping(questionFile, answerFile);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-8 py-8">
      {/* Top Banner / Welcome */}
      <div className="mb-8 text-center sm:text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Upload & Evaluate Exam Submissions
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Upload printed question papers and handwritten student answer sheets for automated spatial mapping and evaluation.
          </p>
        </div>

        {/* Quick Demo Mode Action */}
        {onLoadSampleData && (
          <button
            type="button"
            onClick={onLoadSampleData}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60 rounded-xl border border-indigo-200 dark:border-indigo-800 transition-all shadow-xs shrink-0 cursor-pointer"
          >
            <PlayCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Load Sample Test Fixture
          </button>
        )}
      </div>

      {/* Main 3-Column Responsive Grid: Profile Panel | Question Upload | Answer Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,340px)_1fr_1fr] gap-8 items-start">
        {/* Column 1: Teacher / Exam Context (Figma Screen 1 style) */}
        <div className="flex flex-col gap-6 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm h-full">
          {/* Teacher Badge Card */}
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-purple-50/50 dark:from-indigo-950/40 dark:to-slate-900 border border-indigo-100/80 dark:border-indigo-900/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white font-bold text-base shadow-md shadow-indigo-500/20">
              EV
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Prof. Eleanor Vance
              </h3>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                Physics Department
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Oakridge International Academy
              </p>
            </div>
          </div>

          {/* Workflow Steps / Guide */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Evaluation Pipeline
            </h4>

            <div className="space-y-3">
              <div className="flex items-start gap-3 text-xs">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-[11px]">
                  1
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Question Paper Extraction</span>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                    Identifies numbering structure, subparts (11a, 11b), and mark weights.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-[11px]">
                  2
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Handwritten Answer OCR & Coordinates</span>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                    Detects answer bounding boxes with normalized coordinates [ymin, xmin, ymax, xmax].
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-[11px]">
                  3
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Spatial Mapping & Highlight</span>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                    Aligns out-of-order, unanswered, or unmatched answers with exact interactive overlays.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Supported Formats info */}
          <div className="mt-auto rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/60 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 text-[12px]">
              <HelpCircle className="h-3.5 w-3.5 text-indigo-500" />
              Requirements & Formats
            </div>
            <ul className="space-y-1 text-slate-500 dark:text-slate-400 text-[11px] list-disc list-inside">
              <li>PDF documents (multi-page supported)</li>
              <li>Scanned image files (PNG, JPG, JPEG)</li>
              <li>Max file size: 20MB per file</li>
            </ul>
          </div>
        </div>

        {/* Column 2: Question Paper Upload Card */}
        <div className="flex flex-col gap-2 w-full h-full">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <FileQuestion className="h-3.5 w-3.5 text-indigo-500" />
              Source #1
            </span>
            {questionFile && (
              <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            )}
          </div>
          <FileDropzone
            title="Upload Question Paper"
            description="Upload the master exam question paper with printed questions and marks."
            acceptLabel="PDF, PNG, JPG"
            badgeLabel="Question Paper"
            file={questionFile}
            onFileSelect={setQuestionFile}
          />
        </div>

        {/* Column 3: Answer Sheet Upload Card */}
        <div className="flex flex-col gap-2 w-full h-full">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ScanText className="h-3.5 w-3.5 text-purple-500" />
              Source #2
            </span>
            {answerFile && (
              <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            )}
          </div>
          <FileDropzone
            title="Upload Answer Sheet"
            description="Upload the student's handwritten answer script or scanned pages."
            acceptLabel="PDF, PNG, JPG"
            badgeLabel="Answer Sheet"
            file={answerFile}
            onFileSelect={setAnswerFile}
          />
        </div>

        {/* Spanning Footer Row (Edge Case Warning & Start Mapping Action) */}
        <div className="lg:col-span-3 flex flex-col gap-4 w-full">
          {/* Edge Case Warning: Same File uploaded to both slots */}
          {isSameFile && (
            <div className="flex items-center gap-2 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl text-xs text-amber-800 dark:text-amber-300 animate-in fade-in">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Note:</strong> You uploaded the same file ({questionFile?.name}) for both Question Paper and Answer Sheet. You can still proceed, but ensure this is intended.
              </span>
            </div>
          )}

          {/* Action Row: Start Mapping Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm w-full">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {isBothSelected
                  ? 'Both documents uploaded and ready'
                  : 'Please upload both documents to continue'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isBothSelected
                  ? 'Ready to rasterize pages and run AI extraction & spatial bounding-box mapping.'
                  : 'Requires 1 Question Paper and 1 Answer Sheet.'}
              </p>
            </div>

            <button
              type="button"
              id="start-mapping-btn"
              onClick={handleStart}
              disabled={!isBothSelected}
              className={clsx(
                'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 shadow-sm shrink-0',
                isBothSelected
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25 hover:shadow-md hover:scale-[1.02] cursor-pointer'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-700/50'
              )}
            >
              <span>Start Mapping</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
