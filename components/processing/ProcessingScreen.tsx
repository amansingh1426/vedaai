'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  FileQuestion, 
  ScanText, 
  Layers, 
  CheckCircle2, 
  Loader2, 
  Clock, 
  Sparkles, 
  ArrowLeft, 
  ArrowRight,
  Check, 
  Zap, 
  Terminal, 
  RefreshCw, 
  Eye,
  AlertTriangle,
  AlertOctagon,
  Key
} from 'lucide-react';
import { clsx } from 'clsx';
import { rasterizePdfOrImage } from '@/lib/pdfRasterizer';
import type { ProcessedDocument } from '@/lib/types';
import { GeminiErrorBanner, GeminiErrorInfo } from '@/components/ui/GeminiErrorBanner';
import { ApiErrorResponse, ApiErrorCode, serializeError } from '@/lib/apiHelper';

export type StepState = 'pending' | 'in-progress' | 'done' | 'error';

export interface PipelineStep {
  id: string;
  number: number;
  title: string;
  description: string;
  state: StepState;
  details?: string;
  errorCode?: ApiErrorCode | string;
  isTimeout?: boolean;
  isRateLimit?: boolean;
  isAuthError?: boolean;
  isParseError?: boolean;
  elapsedSeconds?: string;
}

interface ProcessingScreenProps {
  questionFile: File;
  answerFile: File;
  onCancel: () => void;
  onComplete?: (data: { 
    questionDoc: ProcessedDocument; 
    answerDoc: ProcessedDocument;
    extractedQuestions?: any[];
    extractedAnswers?: any[];
    mappings?: any[];
    unmatchedAnswers?: any[];
    summary?: any;
    lowConfidenceMatch?: boolean;
    warning?: string | null;
  }) => void;
}

export const ProcessingScreen: React.FC<ProcessingScreenProps> = ({
  questionFile,
  answerFile,
  onCancel,
  onComplete,
}) => {
  // Rasterization State
  const [isRasterizing, setIsRasterizing] = useState(true);
  const [rasterProgressText, setRasterProgressText] = useState('Initializing PDF rendering engine...');
  const [questionDoc, setQuestionDoc] = useState<ProcessedDocument | null>(null);
  const [answerDoc, setAnswerDoc] = useState<ProcessedDocument | null>(null);
  
  // Stored Pipeline Stage Intermediate Data
  const [extractedQuestions, setExtractedQuestions] = useState<any[] | null>(null);
  const [extractedAnswers, setExtractedAnswers] = useState<any[] | null>(null);
  
  // Low Confidence Sanity Check Warning State
  const [lowConfidenceMatch, setLowConfidenceMatch] = useState(false);
  const [lowConfidenceWarning, setLowConfidenceWarning] = useState<string | null>(null);
  
  // Saved completed payload for results transition
  const [completedPayload, setCompletedPayload] = useState<any>(null);

  // Global Error Banner State
  const [globalError, setGlobalError] = useState<GeminiErrorInfo | null>(null);
  const [isStageRetrying, setIsStageRetrying] = useState<number | null>(null);
  
  // Pipeline Steps State
  const [steps, setSteps] = useState<PipelineStep[]>([
    {
      id: 'step-1',
      number: 1,
      title: 'Question Paper Extraction',
      description: 'Identifies numbering structure, subparts (11a, 11b), and mark weights.',
      state: 'pending',
      details: 'Waiting for document rasterization...',
    },
    {
      id: 'step-2',
      number: 2,
      title: 'Handwritten Answer OCR & Coordinates',
      description: 'Detects answer bounding boxes with normalized coordinates [ymin, xmin, ymax, xmax].',
      state: 'pending',
      details: 'Awaiting Question Paper schema...',
    },
    {
      id: 'step-3',
      number: 3,
      title: 'Spatial Mapping & Highlight',
      description: 'Aligns out-of-order, unanswered, or unmatched answers with exact interactive overlays.',
      state: 'pending',
      details: 'Awaiting bounding boxes & answer tokens...',
    },
  ]);

  const [overallProgress, setOverallProgress] = useState(10);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [isAllDone, setIsAllDone] = useState(false);
  const [activityLogs, setActivityLogs] = useState<string[]>([]);
  const [selectedPreviewPage, setSelectedPreviewPage] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setActivityLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityLogs]);

  /**
   * Unified Single Source of Truth for Error Diagnostics & UI Updates
   * Explicitly extracts all fields from native Error or API payload objects.
   */
  const triggerStageFailure = useCallback((
    stageNum: 1 | 2 | 3,
    errorData: Partial<ApiErrorResponse> & { rawResponse?: any; message?: string },
    clientElapsedSec?: string,
    fallbackMsg = `Failed to process Stage ${stageNum}`
  ) => {
    // Explicitly extract fields without object spreading native Errors
    const isTimeout = Boolean(errorData.isTimeout || errorData.code === 'TIMEOUT');
    const isRateLimit = Boolean(errorData.isRateLimit || errorData.code === 'RATE_LIMIT_EXCEEDED');
    const isAuthError = Boolean(errorData.isAuthError || errorData.code === 'INVALID_API_KEY' || errorData.code === 'MISSING_API_KEY');
    const isParseError = Boolean(errorData.isParseError || errorData.code === 'PARSE_ERROR');
    
    const statusCode = errorData.statusCode || (isRateLimit ? 429 : isTimeout ? 504 : isAuthError ? 401 : isParseError ? 502 : 500);
    const code: ApiErrorCode | string = errorData.code || (isRateLimit ? 'RATE_LIMIT_EXCEEDED' : isTimeout ? 'TIMEOUT' : isAuthError ? 'INVALID_API_KEY' : isParseError ? 'PARSE_ERROR' : 'INTERNAL_ERROR');
    
    const duration = clientElapsedSec ? `${clientElapsedSec}s` : (errorData.elapsedMs ? `${(errorData.elapsedMs / 1000).toFixed(1)}s` : '0.0s');
    const errorMsg = errorData.error || errorData.message || fallbackMsg;

    let logPrefix = `❌ [STAGE ${stageNum} ERROR]`;
    let detailText = errorData.details || `Error (HTTP ${statusCode} in ${duration}): ${errorMsg}`;
    let bannerTitle = `Stage ${stageNum} Execution Error (HTTP ${statusCode})`;
    let bannerType: 'rate-limit' | 'api-key' | 'timeout' | 'generic' = 'generic';

    if (isTimeout) {
      logPrefix = `⏱️ [STAGE ${stageNum} TIMEOUT]`;
      detailText = `Request timed out after ${duration} (threshold: 45s). The model took too long to process. Click Retry.`;
      bannerTitle = `Gemini Request Timed Out (${duration})`;
      bannerType = 'timeout';
    } else if (isRateLimit) {
      logPrefix = `⚠️ [STAGE ${stageNum} RATE LIMIT]`;
      detailText = `Rate limit / quota exceeded (HTTP 429) after ${duration}. Free tier limit is 15 RPM. Wait ~30s before retrying.`;
      bannerTitle = 'Gemini API Rate Limit / Quota Exceeded (HTTP 429)';
      bannerType = 'rate-limit';
    } else if (isAuthError) {
      logPrefix = `🔑 [STAGE ${stageNum} AUTH ERROR]`;
      detailText = `API Key error (HTTP ${statusCode}) after ${duration}: ${errorMsg}`;
      bannerTitle = errorData.code === 'MISSING_API_KEY' ? 'Missing Gemini API Key' : `Invalid Gemini API Key (HTTP ${statusCode})`;
      bannerType = 'api-key';
    } else if (isParseError) {
      logPrefix = `🧩 [STAGE ${stageNum} PARSE ERROR]`;
      detailText = `Model JSON parse error after ${duration}: ${errorMsg}`;
      bannerTitle = 'Model Response Format Error (JSON Parse)';
      bannerType = 'generic';
    }

    // Build plain object with explicit properties (avoid spreading native Error)
    const rawErrorObj = errorData.rawError ? serializeError(errorData.rawError) : undefined;
    const rawResponseObj = errorData.rawResponse ? serializeError(errorData.rawResponse) : undefined;

    const fullDiagnosticPayload = {
      stage: stageNum,
      statusCode,
      code,
      duration,
      message: errorMsg,
      detailText,
      flags: {
        isTimeout,
        isRateLimit,
        isAuthError,
        isParseError,
      },
      details: errorData.details || undefined,
      rawError: rawErrorObj,
      rawResponse: rawResponseObj,
    };

    // Full, comprehensive console diagnostics
    console.error(`[VedaAI Stage ${stageNum} Full Error Details]:`, fullDiagnosticPayload);

    // 1. Update Global Error Banner
    setGlobalError({
      type: bannerType,
      title: bannerTitle,
      message: errorMsg,
      code,
      details: detailText,
      stageNumber: stageNum,
    });

    // 2. Update Stage Step Card in UI
    const stepIdx = stageNum - 1;
    setSteps(prev => prev.map((s, idx) => idx === stepIdx ? {
      ...s,
      state: 'error',
      details: detailText,
      errorCode: code,
      isTimeout,
      isRateLimit,
      isAuthError,
      isParseError,
      elapsedSeconds: duration,
    } : s));

    // 3. Add to live terminal stream
    addLog(`${logPrefix} ${errorMsg} (${duration})`);

    return fullDiagnosticPayload;
  }, [addLog]);

  // =========================================================================
  // STAGE 1: Question Paper Extraction
  // =========================================================================
  const executeStage1 = useCallback(async (qDoc: ProcessedDocument): Promise<any[] | null> => {
    const startTime = performance.now();
    setCurrentStepIndex(0);
    setGlobalError(null);
    setSteps(prev => [
      { 
        ...prev[0], 
        state: 'in-progress', 
        details: `Calling Gemini Flash to extract questions from ${qDoc.pages.length} page(s)...`,
        errorCode: undefined,
        isTimeout: false,
        isRateLimit: false,
        isAuthError: false,
        isParseError: false,
      },
      prev[1],
      prev[2],
    ]);
    addLog(`Step 1/3: Calling Gemini API for Question Paper extraction (${qDoc.pages.length} page(s))...`);

    try {
      const response = await fetch('/api/extract-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: qDoc.pages }),
      });

      const clientElapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const data: any = await response.json().catch((jsonErr) => ({ 
        error: `Invalid JSON response from server (HTTP ${response.status})`,
        statusCode: response.status,
        details: jsonErr?.message,
      }));

      if (!response.ok || !data.success) {
        triggerStageFailure(
          1,
          {
            error: data.error,
            code: data.code,
            statusCode: data.statusCode || response.status,
            details: data.details,
            isTimeout: data.isTimeout,
            isRateLimit: data.isRateLimit,
            isAuthError: data.isAuthError,
            isParseError: data.isParseError,
            rawError: data.rawError,
            rawResponse: data,
          },
          clientElapsedSec,
          'Failed to extract questions from Question Paper'
        );
        return null;
      }

      const clientElapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      const questions: { number: string; text: string; pageIndex: number }[] = data.questions || [];
      setExtractedQuestions(questions);

      const totalQ = questions.length;
      const subparts = questions.filter(q => /[a-zA-Z]|\(|\)/.test(q.number) && !/^[0-9]+$/.test(q.number));
      const subpartStr = subparts.length > 0 
        ? ` including ${subparts.length} sub-part${subparts.length > 1 ? 's' : ''}: ${subparts.map(s => s.number).join(', ')}`
        : '';
      const qNumbersSummary = questions.map(q => q.number).join(', ');
      const step1SuccessDetail = `Extracted ${totalQ} question${totalQ !== 1 ? 's' : ''}${subpartStr} in ${clientElapsed}s [${qNumbersSummary}].`;

      setSteps(prev => [
        { 
          ...prev[0], 
          state: 'done', 
          details: step1SuccessDetail,
          errorCode: undefined,
          isTimeout: false,
          isRateLimit: false,
          isAuthError: false,
          isParseError: false,
          elapsedSeconds: `${clientElapsed}s`,
        },
        prev[1],
        prev[2],
      ]);
      setOverallProgress(50);
      addLog(`✓ Stage 1 Complete in ${clientElapsed}s: Extracted ${totalQ} questions${subpartStr} (${qNumbersSummary})`);

      return questions;
    } catch (err: any) {
      const clientElapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const extractedErr = serializeError(err);
      triggerStageFailure(
        1,
        { 
          error: extractedErr.message || 'Network fetch failed', 
          code: 'INTERNAL_ERROR', 
          details: `Client Fetch Exception: ${extractedErr.message || String(err)}`, 
          rawError: extractedErr,
          rawResponse: extractedErr,
        },
        clientElapsedSec,
        'Network fetch failed while contacting extraction service'
      );
      return null;
    }
  }, [addLog, triggerStageFailure]);

  // =========================================================================
  // STAGE 2: Handwritten Answer OCR & Coordinates
  // =========================================================================
  const executeStage2 = useCallback(async (aDoc: ProcessedDocument): Promise<any[] | null> => {
    const startTime = performance.now();
    setCurrentStepIndex(1);
    setGlobalError(null);
    setSteps(prev => [
      prev[0],
      { 
        ...prev[1], 
        state: 'in-progress', 
        details: `Scanning handwritten answer tokens and bounding boxes on ${aDoc.pages.length} page(s)...`,
        errorCode: undefined,
        isTimeout: false,
        isRateLimit: false,
        isAuthError: false,
        isParseError: false,
      },
      prev[2],
    ]);
    addLog(`Step 2/3: Calling Gemini API for Handwritten OCR and Spatial Coordinates (${aDoc.pages.length} page(s))...`);

    try {
      const answerResponse = await fetch('/api/extract-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: aDoc.pages }),
      });

      const clientElapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const answerData: any = await answerResponse.json().catch((jsonErr) => ({ 
        error: `Invalid JSON response from server (HTTP ${answerResponse.status})`,
        statusCode: answerResponse.status,
        details: jsonErr?.message,
      }));

      if (!answerResponse.ok || !answerData.success) {
        triggerStageFailure(
          2,
          {
            error: answerData.error,
            code: answerData.code,
            statusCode: answerData.statusCode || answerResponse.status,
            details: answerData.details,
            isTimeout: answerData.isTimeout,
            isRateLimit: answerData.isRateLimit,
            isAuthError: answerData.isAuthError,
            isParseError: answerData.isParseError,
            rawError: answerData.rawError,
            rawResponse: answerData,
          },
          clientElapsedSec,
          'Failed to extract answer blocks from Answer Sheet'
        );
        return null;
      }

      const clientElapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      const answers = answerData.answers || [];
      setExtractedAnswers(answers);

      const totalAns = answers.length;
      const detectedGuesses: string[] = (answerData.detectedGuesses || []).filter(Boolean);
      const guessesSummary = detectedGuesses.length > 0
        ? ` [Guessed Q#: ${detectedGuesses.join(', ')}]`
        : '';

      const step2SuccessDetail = `Detected ${totalAns} handwritten answer block${totalAns !== 1 ? 's' : ''} across ${aDoc.pages.length} page(s) in ${clientElapsed}s${guessesSummary}.`;

      setSteps(prev => [
        prev[0],
        { 
          ...prev[1], 
          state: 'done', 
          details: step2SuccessDetail,
          errorCode: undefined,
          isTimeout: false,
          isRateLimit: false,
          isAuthError: false,
          isParseError: false,
          elapsedSeconds: `${clientElapsed}s`,
        },
        prev[2],
      ]);
      setOverallProgress(85);
      addLog(`✓ Stage 2 Complete in ${clientElapsed}s: Detected ${totalAns} answer block${totalAns !== 1 ? 's' : ''}${guessesSummary} with bounding boxes`);
      if (detectedGuesses.length > 0) {
        addLog(`  ↳ Guessed Question Numbers: ${detectedGuesses.join(', ')}`);
      }

      return answers;
    } catch (err: any) {
      const clientElapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const extractedErr = serializeError(err);
      triggerStageFailure(
        2,
        { 
          error: extractedErr.message || 'Network fetch failed', 
          code: 'INTERNAL_ERROR', 
          details: `Client Fetch Exception: ${extractedErr.message || String(err)}`, 
          rawError: extractedErr,
          rawResponse: extractedErr,
        },
        clientElapsedSec,
        'Network error during answer extraction'
      );
      return null;
    }
  }, [addLog, triggerStageFailure]);

  // =========================================================================
  // STAGE 3: Spatial Mapping & Highlight
  // =========================================================================
  const executeStage3 = useCallback(async (
    qList: any[], 
    aList: any[], 
    qDoc: ProcessedDocument, 
    aDoc: ProcessedDocument
  ): Promise<boolean> => {
    const startTime = performance.now();
    setCurrentStepIndex(2);
    setGlobalError(null);
    setSteps(prev => [
      prev[0],
      prev[1],
      { 
        ...prev[2], 
        state: 'in-progress', 
        details: `Correlating ${aList.length} answer block(s) with ${qList.length} question(s)...`,
        errorCode: undefined,
        isTimeout: false,
        isRateLimit: false,
        isAuthError: false,
        isParseError: false,
      },
    ]);
    addLog(`Step 3/3: Correlating answers against question hierarchy (${aList.length} answers, ${qList.length} questions)...`);

    try {
      const mapResponse = await fetch('/api/map-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: qList,
          answers: aList,
        }),
      });

      const clientElapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const mapData: any = await mapResponse.json().catch((jsonErr) => ({ 
        error: `Invalid JSON response from server (HTTP ${mapResponse.status})`,
        statusCode: mapResponse.status,
        details: jsonErr?.message,
      }));

      if (!mapResponse.ok || !mapData.success) {
        triggerStageFailure(
          3,
          {
            error: mapData.error,
            code: mapData.code,
            statusCode: mapData.statusCode || mapResponse.status,
            details: mapData.details,
            isTimeout: mapData.isTimeout,
            isRateLimit: mapData.isRateLimit,
            isAuthError: mapData.isAuthError,
            isParseError: mapData.isParseError,
            rawError: mapData.rawError,
            rawResponse: mapData,
          },
          clientElapsedSec,
          'Failed to map answer blocks to questions'
        );
        return false;
      }

      const clientElapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      const summary = mapData.summary || {
        answeredCount: 0,
        unansweredCount: 0,
        outOfOrderCount: 0,
        unmatchedCount: 0,
      };

      const isLowConfidence = Boolean(mapData.lowConfidenceMatch || mapData.summary?.lowConfidenceMatch);
      if (isLowConfidence) {
        const warnText = mapData.warning || mapData.summary?.warning || 'Very few answers could be matched to this question paper. The uploaded answer sheet may not correspond to this question paper — please verify you uploaded the correct files.';
        setLowConfidenceMatch(true);
        setLowConfidenceWarning(warnText);
        addLog(`⚠️ SANITY CHECK WARNING: Low confidence match detected (${summary.unansweredCount}/${qList.length} unanswered, ${summary.unmatchedCount}/${aList.length} unmatched).`);
      }

      const stage3SummaryStr = `Mapped ${summary.answeredCount} answered, ${summary.unansweredCount} unanswered, ${summary.outOfOrderCount} out-of-order, ${summary.unmatchedCount} unmatched in ${clientElapsed}s.`;

      setSteps(prev => [
        prev[0],
        prev[1],
        { 
          ...prev[2], 
          state: 'done', 
          details: stage3SummaryStr,
          errorCode: undefined,
          isTimeout: false,
          isRateLimit: false,
          isAuthError: false,
          isParseError: false,
          elapsedSeconds: `${clientElapsed}s`,
        },
      ]);
      setOverallProgress(100);
      setCurrentStepIndex(3);
      setIsAllDone(true);
      addLog(`✓ Stage 3 Complete in ${clientElapsed}s: ${stage3SummaryStr}`);
      addLog(`🎉 Evaluation Pipeline complete! Spatial mapping and overlays ready.`);

      const payload = { 
        questionDoc: qDoc, 
        answerDoc: aDoc,
        extractedQuestions: qList,
        extractedAnswers: aList,
        mappings: mapData.mappings,
        unmatchedAnswers: mapData.unmatchedAnswers,
        summary: mapData.summary,
        lowConfidenceMatch: isLowConfidence,
        warning: mapData.warning || mapData.summary?.warning || null,
      };
      setCompletedPayload(payload);

      if (onComplete) {
        onComplete(payload);
      }

      return true;
    } catch (err: any) {
      const clientElapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const extractedErr = serializeError(err);
      triggerStageFailure(
        3,
        { 
          error: extractedErr.message || 'Network fetch failed', 
          code: 'INTERNAL_ERROR', 
          details: `Client Fetch Exception: ${extractedErr.message || String(err)}`, 
          rawError: extractedErr,
          rawResponse: extractedErr,
        },
        clientElapsedSec,
        'Network error during spatial mapping'
      );
      return false;
    }
  }, [addLog, triggerStageFailure, onComplete]);

  // =========================================================================
  // Individual Stage Retry Handlers
  // =========================================================================
  const handleRetryStage = async (stageNumber: number) => {
    if (isStageRetrying !== null) return;
    setIsStageRetrying(stageNumber);
    addLog(`🔄 User triggered retry for Stage ${stageNumber}...`);

    try {
      if (stageNumber === 1 && questionDoc) {
        const qList = await executeStage1(questionDoc);
        if (qList && answerDoc) {
          let aList = extractedAnswers;
          if (!aList) {
            aList = await executeStage2(answerDoc);
          }
          if (aList) {
            await executeStage3(qList, aList, questionDoc, answerDoc);
          }
        }
      } else if (stageNumber === 2 && answerDoc && (extractedQuestions || questionDoc)) {
        let qList = extractedQuestions;
        if (!qList && questionDoc) {
          qList = await executeStage1(questionDoc);
        }
        if (qList) {
          const aList = await executeStage2(answerDoc);
          if (aList && questionDoc) {
            await executeStage3(qList, aList, questionDoc, answerDoc);
          }
        }
      } else if (stageNumber === 3 && questionDoc && answerDoc && extractedQuestions && extractedAnswers) {
        await executeStage3(extractedQuestions, extractedAnswers, questionDoc, answerDoc);
      }
    } finally {
      setIsStageRetrying(null);
    }
  };

  // =========================================================================
  // Initial Pipeline Execution on Mount
  // =========================================================================
  useEffect(() => {
    let isMounted = true;

    async function runInitialPipeline() {
      try {
        // --- PHASE 0: PDF Page Rasterization ---
        addLog(`Started client-side rasterization for Question Paper: "${questionFile.name}"...`);
        setRasterProgressText(`Rasterizing Question Paper (${(questionFile.size / 1024).toFixed(1)} KB)...`);
        
        const qDoc = await rasterizePdfOrImage(questionFile, 'question_paper');
        if (!isMounted) return;
        setQuestionDoc(qDoc);
        addLog(`✓ Question Paper rasterized successfully: ${qDoc.pages.length} page(s)`);

        addLog(`Started client-side rasterization for Answer Sheet: "${answerFile.name}"...`);
        setRasterProgressText(`Rasterizing Answer Sheet (${(answerFile.size / 1024).toFixed(1)} KB)...`);
        
        const aDoc = await rasterizePdfOrImage(answerFile, 'answer_sheet');
        if (!isMounted) return;
        setAnswerDoc(aDoc);
        addLog(`✓ Answer Sheet rasterized successfully: ${aDoc.pages.length} page(s)`);

        const totalRasterized = qDoc.pages.length + aDoc.pages.length;
        console.log(`[VedaAI Pipeline] PDF Rasterization complete! Total pages: ${totalRasterized}`);

        setIsRasterizing(false);
        setOverallProgress(25);
        addLog(`Client-side preprocessing complete. Starting 3-step Evaluation Pipeline...`);

        // --- STEP 1 ---
        const qList = await executeStage1(qDoc);
        if (!qList || !isMounted) return;

        // --- STEP 2 ---
        const aList = await executeStage2(aDoc);
        if (!aList || !isMounted) return;

        // --- STEP 3 ---
        await executeStage3(qList, aList, qDoc, aDoc);
      } catch (err: any) {
        const extracted = serializeError(err);
        console.error('Error running processing pipeline:', extracted);
        addLog(`❌ Error in pipeline processing: ${extracted.message || String(err)}`);
      }
    }

    runInitialPipeline();

    return () => {
      isMounted = false;
    };
  }, [questionFile, answerFile, executeStage1, executeStage2, executeStage3, addLog]);

  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 lg:px-8 py-8 animate-in fade-in duration-300">
      {/* Top Header / Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Return to Upload"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" />
                  Live Pipeline
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-400" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Phase 2 Execution</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">
                {isAllDone ? 'Processing & Spatial Mapping Complete' : 'Processing Exam Documents'}
              </h1>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-3">
          {isAllDone ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold shadow-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Pipeline Finished (100%)
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold shadow-xs">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
              {isRasterizing ? 'Rasterizing PDF Pages...' : `Stage ${Math.min(currentStepIndex + 1, 3)} of 3 Active`}
            </div>
          )}

          <button
            onClick={onCancel}
            className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors shadow-xs cursor-pointer"
          >
            Cancel / Back
          </button>
        </div>
      </div>

      {/* Global Toast/Banner for Gemini Rate Limit, Invalid API Key, or Timeout */}
      <GeminiErrorBanner
        error={globalError}
        isRetrying={isStageRetrying !== null}
        onRetry={globalError?.stageNumber ? () => handleRetryStage(globalError.stageNumber!) : undefined}
        onDismiss={() => setGlobalError(null)}
      />

      {/* Prominent Low Confidence Document Mismatch Warning Banner */}
      {lowConfidenceMatch && (
        <div className="mb-8 p-5 sm:p-6 rounded-3xl bg-amber-500/10 dark:bg-amber-950/40 border-2 border-amber-500/50 dark:border-amber-600/50 shadow-md animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-amber-500 text-white shrink-0 shadow-sm mt-0.5">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2.5 py-0.5 rounded-md border border-amber-300 dark:border-amber-800">
                    Sanity Check Warning
                  </span>
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    High Mismatch Rate (&gt;70%)
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-amber-100">
                  Possible Document Mismatch Detected
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-3xl">
                  {lowConfidenceWarning || 'Very few answers could be matched to this question paper. The uploaded answer sheet may not correspond to this question paper — please verify you uploaded the correct files.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={onCancel}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Change / Re-upload Files
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar Header Card */}
      <div className="mb-8 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Evaluation Pipeline Progress
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isRasterizing 
                ? rasterProgressText 
                : isAllDone 
                ? 'All stages completed successfully. Ready for evaluation interface.' 
                : steps.some(s => s.state === 'error')
                ? 'Pipeline paused due to a stage error. You can view the exact diagnostics and retry directly below.'
                : `Executing Step ${currentStepIndex + 1}: ${steps[currentStepIndex]?.title || 'Processing'}`}
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold font-mono tracking-tight text-indigo-600 dark:text-indigo-400">
              {overallProgress}%
            </span>
          </div>
        </div>

        {/* Fluid Progress Bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700/50">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 rounded-full transition-all duration-700 ease-out shadow-xs"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* 2-Column Main Grid: Pipeline Staged List | Document & Activity Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: 3-Step Pipeline Staged List (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1 flex items-center justify-between">
            <span>Staged Pipeline Execution</span>
            <span className="text-[11px] font-normal text-slate-400">3 Stages</span>
          </h3>

          <div className="space-y-4">
            {steps.map((step) => {
              const isPending = step.state === 'pending';
              const isInProgress = step.state === 'in-progress';
              const isDone = step.state === 'done';
              const isError = step.state === 'error';
              const isCurrentlyRetrying = isStageRetrying === step.number;

              return (
                <div
                  key={step.id}
                  className={clsx(
                    'p-6 rounded-3xl border transition-all duration-300 relative overflow-hidden',
                    isInProgress && 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700/70 shadow-md ring-1 ring-indigo-500/20',
                    isDone && 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/80 shadow-xs',
                    isPending && 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/40 opacity-70',
                    isError && 'bg-rose-50/60 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/80 shadow-sm'
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Stage Indicator Icon */}
                    <div className="shrink-0 mt-0.5">
                      {isDone && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
                          <Check className="h-5 w-5 stroke-[2.5]" />
                        </div>
                      )}
                      {isInProgress && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/30 animate-pulse">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      )}
                      {isPending && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-sm">
                          {step.number}
                        </div>
                      )}
                      {isError && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-md shadow-rose-500/20">
                          {step.isTimeout ? (
                            <Clock className="h-5 w-5" />
                          ) : step.isRateLimit ? (
                            <AlertTriangle className="h-5 w-5" />
                          ) : step.isAuthError ? (
                            <Key className="h-5 w-5" />
                          ) : (
                            <AlertOctagon className="h-5 w-5" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Stage Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                            Stage 0{step.number}
                          </span>
                          <h4 className="text-base font-bold text-slate-900 dark:text-white">
                            {step.title}
                          </h4>
                        </div>

                        {/* Status Tag */}
                        <div>
                          {isDone && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                              Completed {step.elapsedSeconds ? `(${step.elapsedSeconds})` : ''}
                            </span>
                          )}
                          {isInProgress && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 animate-pulse">
                              <Loader2 className="h-3 w-3 animate-spin text-indigo-600 dark:text-indigo-400" />
                              In Progress
                            </span>
                          )}
                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              <Clock className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                          {isError && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-mono">
                              {step.isTimeout ? 'Timed Out (45s)' : step.isRateLimit ? 'Rate Limited (429)' : step.isAuthError ? 'Auth Error' : step.isParseError ? 'Parse Error' : 'Failed'}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {step.description}
                      </p>

                      {/* Realtime Stage Details */}
                      {step.details && (
                        <div className={clsx(
                          'mt-3 px-3.5 py-2.5 rounded-xl text-xs flex items-start gap-2 border font-mono leading-relaxed',
                          isInProgress && 'bg-indigo-100/50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800',
                          isDone && 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800',
                          isPending && 'bg-slate-100/50 dark:bg-slate-800/30 text-slate-400 dark:text-slate-500 border-slate-200/50 dark:border-slate-800/40',
                          isError && 'bg-rose-100/70 dark:bg-rose-950/70 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-800'
                        )}>
                          <span className="shrink-0 mt-0.5">{isError ? '⚠️' : '➜'}</span>
                          <span className="break-all">{step.details}</span>
                        </div>
                      )}

                      {/* Stage-Specific Retry Action Button on Error */}
                      {isError && (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleRetryStage(step.number)}
                            disabled={isCurrentlyRetrying || isStageRetrying !== null}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RefreshCw className={clsx('h-3.5 w-3.5', isCurrentlyRetrying && 'animate-spin')} />
                            <span>
                              {isCurrentlyRetrying
                                ? `Retrying Stage ${step.number}...`
                                : step.isTimeout
                                ? `Try Stage ${step.number} Again (Timeout)`
                                : `Retry Stage ${step.number} Only`}
                            </span>
                          </button>
                          
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Re-runs only this pipeline stage without re-uploading.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action on Complete */}
          {isAllDone && (
            <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-emerald-500/10 border border-indigo-200 dark:border-indigo-800/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  Extraction &amp; Spatial Mapping Complete
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Both question paper and student answers are localized and ready for grading.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (onComplete && completedPayload) {
                      onComplete(completedPayload);
                    }
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>View Spatial Results</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.reload();
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-run Test
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Rasterized Page Images & Live Event Terminal (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Documents Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-indigo-500" />
                Rasterized Documents
              </span>
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                {questionDoc && answerDoc 
                  ? `${questionDoc.pages.length + answerDoc.pages.length} Total Pages` 
                  : isRasterizing ? 'Rasterizing...' : '0 Pages'}
              </span>
            </h3>

            {/* Question Paper Summary & Pages */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FileQuestion className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {questionFile.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
                  {questionDoc ? `${questionDoc.pages.length} page(s)` : 'Rasterizing...'}
                </span>
              </div>

              {/* Thumbnails */}
              {questionDoc && (
                <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
                  {questionDoc.pages.map((p, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setSelectedPreviewPage(p.dataUrl)}
                      className="group relative h-20 w-16 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-xs cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all"
                    >
                      <img src={p.dataUrl} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye className="h-3.5 w-3.5 text-white" />
                      </div>
                      <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold bg-slate-900/80 text-white px-1 rounded">
                        p.{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Answer Sheet Summary & Pages */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <ScanText className="h-4 w-4 text-purple-500 shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {answerFile.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-medium">
                  {answerDoc ? `${answerDoc.pages.length} page(s)` : 'Rasterizing...'}
                </span>
              </div>

              {/* Thumbnails */}
              {answerDoc && (
                <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
                  {answerDoc.pages.map((p, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setSelectedPreviewPage(p.dataUrl)}
                      className="group relative h-20 w-16 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-xs cursor-pointer hover:ring-2 hover:ring-purple-500 transition-all"
                    >
                      <img src={p.dataUrl} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye className="h-3.5 w-3.5 text-white" />
                      </div>
                      <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold bg-slate-900/80 text-white px-1 rounded">
                        p.{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Live Activity Terminal */}
          <div className="p-6 rounded-3xl bg-slate-950 text-slate-300 border border-slate-800 shadow-xl space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Execution Stream
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[10px] text-slate-400">Live</span>
              </div>
            </div>

            <div className="h-44 overflow-y-auto space-y-1.5 text-[11px] pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              {activityLogs.map((log, i) => (
                <div 
                  key={i} 
                  className={clsx(
                    'leading-relaxed break-words',
                    log.includes('✓') && 'text-emerald-400',
                    log.includes('🎉') && 'text-purple-400 font-bold',
                    log.includes('❌') && 'text-rose-400',
                    log.includes('🔄') && 'text-amber-400',
                    log.includes('⚡') && 'text-rose-300 font-semibold',
                    log.includes('⏱️') && 'text-blue-300 font-semibold',
                    log.includes('🔑') && 'text-purple-300 font-semibold',
                    log.includes('⚠️') && 'text-amber-300 font-semibold',
                    log.includes('🧩') && 'text-orange-300 font-semibold',
                    !log.includes('✓') && !log.includes('🎉') && !log.includes('❌') && !log.includes('🔄') && !log.includes('⚡') && !log.includes('⏱️') && !log.includes('🔑') && !log.includes('⚠️') && !log.includes('🧩') && 'text-slate-400'
                  )}
                >
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Page Preview Modal */}
      {selectedPreviewPage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPreviewPage(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 p-2 rounded-2xl border border-slate-700 shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-xs text-slate-300">
              <span>Rasterized Page Inspection</span>
              <button 
                onClick={() => setSelectedPreviewPage(null)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-white text-xs cursor-pointer"
              >
                Close ✕
              </button>
            </div>
            <div className="p-2 overflow-auto max-h-[80vh] flex items-center justify-center">
              <img src={selectedPreviewPage} alt="Preview" className="rounded max-h-[75vh] w-auto object-contain border border-slate-800" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
