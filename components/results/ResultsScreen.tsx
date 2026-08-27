'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  FileQuestion,
  ScanText,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Search,
  AlertTriangle,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Layers
} from 'lucide-react';
import { clsx } from 'clsx';
import type { ProcessedDocument, PageImage } from '@/lib/types';

export interface FinalMappingItem {
  id: string;
  questionNumber: string;
  question: {
    id?: string;
    number: string;
    text: string;
    pageIndex?: number;
    maxMarks?: number;
  };
  answerBlockId: string | null;
  answer: {
    id: string;
    questionNumberGuess?: string | null;
    text: string;
    pageIndex?: number;
    bbox?: {
      ymin: number;
      xmin: number;
      ymax: number;
      xmax: number;
      top?: number;
      left?: number;
      bottom?: number;
      right?: number;
    };
    box?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    box_2d?: [number, number, number, number];
    continuesFromPageIndex?: number | null;
  } | null;
  status: 'answered' | 'unanswered' | 'out_of_order';
  matchReason?: string;
}

export interface UnmatchedAnswerItem {
  id: string;
  questionNumberGuess?: string | null;
  text: string;
  pageIndex?: number;
  bbox?: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  box_2d?: [number, number, number, number];
  continuesFromPageIndex?: number | null;
}

export interface ResultsScreenProps {
  questionDoc: ProcessedDocument;
  answerDoc: ProcessedDocument;
  extractedQuestions?: any[];
  extractedAnswers?: any[];
  mappings: FinalMappingItem[];
  unmatchedAnswers?: UnmatchedAnswerItem[];
  summary?: {
    totalQuestions: number;
    totalAnswersExtracted?: number;
    answeredCount: number;
    unansweredCount: number;
    outOfOrderCount: number;
    unmatchedCount: number;
    [key: string]: any;
  };
  lowConfidenceMatch?: boolean;
  warning?: string | null;
  onBackToUpload: () => void;
}

/**
 * Normalizes question numbers for robust string comparison (e.g. "Q.01", "Q.1", "1", "1(a)", "Ans 1", "01")
 */
export function normalizeQNum(str?: string | null): string {
  if (!str) return '';
  let s = String(str)
    .toLowerCase()
    .replace(/^q(?:uestion)?[\s.:#-]*/i, '')
    .replace(/^ans(?:wer)?[\s.:#-]*/i, '')
    .replace(/^sec(?:tion)?[\s.:#-]*/i, '')
    .replace(/[\s.-]/g, '')
    .trim();
  
  // Strip leading zeroes e.g. "01" -> "1", "02" -> "2", "01(a)" -> "1(a)"
  s = s.replace(/^0+([1-9])/g, '$1');
  return s;
}

/**
 * Safely extracts normalized [0-1] coordinates from any bbox format
 */
function extractNormalizedBbox(item: any): { ymin: number; xmin: number; ymax: number; xmax: number } {
  if (!item) return { ymin: 0, xmin: 0, ymax: 0.2, xmax: 0.8 };

  let ymin = 0;
  let xmin = 0;
  let ymax = 0.2;
  let xmax = 0.8;

  if (item.bbox && typeof item.bbox === 'object') {
    const rawYmin = item.bbox.ymin ?? item.bbox.yMin ?? item.bbox.top ?? 0;
    const rawXmin = item.bbox.xmin ?? item.bbox.xMin ?? item.bbox.left ?? 0;
    const rawYmax = item.bbox.ymax ?? item.bbox.yMax ?? item.bbox.bottom ?? (rawYmin + 0.2);
    const rawXmax = item.bbox.xmax ?? item.bbox.xMax ?? item.bbox.right ?? (rawXmin + 0.8);
    ymin = rawYmin > 1 ? rawYmin / 1000 : rawYmin;
    xmin = rawXmin > 1 ? rawXmin / 1000 : rawXmin;
    ymax = rawYmax > 1 ? rawYmax / 1000 : rawYmax;
    xmax = rawXmax > 1 ? rawXmax / 1000 : rawXmax;
  } else if (item.box && typeof item.box === 'object') {
    const rawX = item.box.x ?? 0;
    const rawY = item.box.y ?? 0;
    const rawW = item.box.width ?? 0.8;
    const rawH = item.box.height ?? 0.2;
    xmin = rawX > 1 ? rawX / 1000 : rawX;
    ymin = rawY > 1 ? rawY / 1000 : rawY;
    const w = rawW > 1 ? rawW / 1000 : rawW;
    const h = rawH > 1 ? rawH / 1000 : rawH;
    xmax = xmin + w;
    ymax = ymin + h;
  } else if (Array.isArray(item.box_2d) && item.box_2d.length === 4) {
    ymin = item.box_2d[0] > 1 ? item.box_2d[0] / 1000 : item.box_2d[0];
    xmin = item.box_2d[1] > 1 ? item.box_2d[1] / 1000 : item.box_2d[1];
    ymax = item.box_2d[2] > 1 ? item.box_2d[2] / 1000 : item.box_2d[2];
    xmax = item.box_2d[3] > 1 ? item.box_2d[3] / 1000 : item.box_2d[3];
  } else if (typeof item.ymin === 'number' || typeof item.top === 'number') {
    const rawYmin = item.ymin ?? item.top ?? 0;
    const rawXmin = item.xmin ?? item.left ?? 0;
    const rawYmax = item.ymax ?? item.bottom ?? (rawYmin + 0.2);
    const rawXmax = item.xmax ?? item.right ?? (rawXmin + 0.8);
    ymin = rawYmin > 1 ? rawYmin / 1000 : rawYmin;
    xmin = rawXmin > 1 ? rawXmin / 1000 : rawXmin;
    ymax = rawYmax > 1 ? rawYmax / 1000 : rawYmax;
    xmax = rawXmax > 1 ? rawXmax / 1000 : rawXmax;
  }

  // Ensure non-inverted bounds
  if (ymax <= ymin) ymax = Math.min(1, ymin + 0.1);
  if (xmax <= xmin) xmax = Math.min(1, xmin + 0.3);

  return {
    ymin: Math.max(0, Math.min(1, ymin)),
    xmin: Math.max(0, Math.min(1, xmin)),
    ymax: Math.max(0, Math.min(1, ymax)),
    xmax: Math.max(0, Math.min(1, xmax)),
  };
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  questionDoc,
  answerDoc,
  extractedQuestions = [],
  extractedAnswers = [],
  mappings = [],
  unmatchedAnswers = [],
  summary,
  lowConfidenceMatch = false,
  warning = null,
  onBackToUpload,
}) => {
  // Page Viewer State
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'answered' | 'unanswered' | 'out_of_order' | 'unmatched'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewDocumentType, setViewDocumentType] = useState<'answer_sheet' | 'question_paper'>('answer_sheet');
  const [fitMode, setFitMode] = useState<'fit-page' | 'fit-width'>('fit-page');
  const [zoomScale, setZoomScale] = useState<number>(100);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Single source of truth for active selection
  const [selectedType, setSelectedType] = useState<'question' | 'unmatched'>('question');
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState<string>(() => {
    const firstAnswered = mappings.find(m => m.status === 'answered' || m.status === 'out_of_order');
    return firstAnswered?.questionNumber || mappings[0]?.questionNumber || '1';
  });
  const [selectedUnmatchedId, setSelectedUnmatchedId] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const unmatchedSectionRef = useRef<HTMLDivElement>(null);

  // Helper to resolve an answer block from mapping or fallback pool
  const resolveAnswerBlock = useCallback((m: FinalMappingItem | null) => {
    if (!m) return null;
    // 1. Direct answer on mapping
    if (m.answer && (m.answer.bbox || m.answer.box || m.answer.box_2d || (m.answer as any).ymin !== undefined)) {
      return m.answer;
    }
    // 2. Lookup by answerBlockId in extractedAnswers
    if (m.answerBlockId && extractedAnswers.length > 0) {
      const found = extractedAnswers.find(a => a.id === m.answerBlockId);
      if (found) return found;
    }
    // 3. Fallback: match by normalized questionNumber in extractedAnswers
    if (m.status !== 'unanswered' && extractedAnswers.length > 0) {
      const qNorm = normalizeQNum(m.questionNumber);
      const found = extractedAnswers.find(a => 
        normalizeQNum(a.questionNumberGuess || (a as any).questionNumber) === qNorm
      );
      if (found) return found;
    }
    return m.answer || null;
  }, [extractedAnswers]);

  // Derived active mapping item (recalculated reactively from selectedQuestionNumber)
  const activeMapping = useMemo(() => {
    if (selectedType !== 'question') return null;
    return mappings.find(m => 
      String(m.questionNumber).trim().toLowerCase() === String(selectedQuestionNumber).trim().toLowerCase() ||
      normalizeQNum(m.questionNumber) === normalizeQNum(selectedQuestionNumber)
    ) || mappings[0] || null;
  }, [selectedType, selectedQuestionNumber, mappings]);

  // Derived active unmatched item (recalculated reactively from selectedUnmatchedId)
  const activeUnmatched = useMemo(() => {
    if (selectedType !== 'unmatched' || !selectedUnmatchedId) return null;
    return unmatchedAnswers.find(u => u.id === selectedUnmatchedId) || unmatchedAnswers[0] || null;
  }, [selectedType, selectedUnmatchedId, unmatchedAnswers]);

  // Derived active answer block (recalculated reactively on every selection update)
  const activeAnswer = useMemo(() => {
    if (selectedType === 'question') {
      if (!activeMapping || activeMapping.status === 'unanswered') return null;
      return resolveAnswerBlock(activeMapping);
    }
    if (selectedType === 'unmatched') {
      return activeUnmatched;
    }
    return null;
  }, [selectedType, activeMapping, activeUnmatched, resolveAnswerBlock]);

  // Header stat pill filter handler
  const handleFilterFromHeader = (filter: 'all' | 'answered' | 'unanswered' | 'out_of_order' | 'unmatched') => {
    setActiveTabFilter(filter);
    if (filter === 'unmatched') {
      setTimeout(() => {
        unmatchedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  // Measure rendered image dimensions dynamically
  const updateDimensions = useCallback(() => {
    if (imageRef.current) {
      const width = imageRef.current.clientWidth;
      const height = imageRef.current.clientHeight;
      if (width > 0 && height > 0) {
        setImageDimensions({ width, height });
        setImageLoaded(true);
      }
    }
  }, []);

  const handleImageLoad = () => {
    updateDimensions();
  };

  // Ensure image dimensions are captured immediately on mount & page change
  useEffect(() => {
    updateDimensions();
    const timer = setTimeout(updateDimensions, 80);
    return () => clearTimeout(timer);
  }, [currentPageIndex, viewDocumentType, fitMode, zoomScale, updateDimensions]);

  // ResizeObserver on image element to track dynamic layout / aspect ratio shifts
  useEffect(() => {
    if (!imageRef.current) return;
    const ro = new ResizeObserver(() => {
      updateDimensions();
    });
    ro.observe(imageRef.current);
    return () => ro.disconnect();
  }, [updateDimensions, currentPageIndex]);

  // Select Question Handler (Directly updates state and switches page if answered)
  const handleSelectQuestion = (m: FinalMappingItem) => {
    const ans = resolveAnswerBlock(m);
    console.log('[ResultsScreen CLICK Question]', {
      id: m.id,
      questionNumber: m.questionNumber,
      status: m.status,
      answerBlockId: m.answerBlockId,
      answerBbox: m.answer?.bbox,
      resolvedAnsBbox: ans?.bbox,
      resolvedAnsId: ans?.id,
    });

    setSelectedType('question');
    setSelectedQuestionNumber(m.questionNumber);
    setSelectedUnmatchedId(null);
    setViewDocumentType('answer_sheet');

    if (ans && typeof ans.pageIndex === 'number') {
      setCurrentPageIndex(ans.pageIndex);
    }
  };

  // Select Unmatched Handler (Directly updates state and switches page)
  const handleSelectUnmatched = (uAns: UnmatchedAnswerItem) => {
    console.log('[ResultsScreen CLICK Unmatched]', {
      id: uAns.id,
      bbox: uAns.bbox,
      pageIndex: uAns.pageIndex,
    });

    setSelectedType('unmatched');
    setSelectedUnmatchedId(uAns.id);
    setViewDocumentType('answer_sheet');

    if (typeof uAns.pageIndex === 'number') {
      setCurrentPageIndex(uAns.pageIndex);
    }
  };

  // Filtered Question List
  const filteredMappings = useMemo(() => {
    return mappings.filter(m => {
      if (activeTabFilter !== 'all' && activeTabFilter !== 'unmatched' && m.status !== activeTabFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchNum = m.questionNumber.toLowerCase().includes(query);
        const matchText = (m.question.text || '').toLowerCase().includes(query);
        const matchAns = (m.answer?.text || '').toLowerCase().includes(query);
        return matchNum || matchText || matchAns;
      }
      return true;
    });
  }, [mappings, activeTabFilter, searchQuery]);

  // Determine page where active selection lives
  const selectionTargetPage = useMemo(() => {
    if (activeAnswer && typeof activeAnswer.pageIndex === 'number') {
      return activeAnswer.pageIndex;
    }
    return null;
  }, [activeAnswer]);

  // Is selection visible on the currently viewed page?
  const isSelectionOnCurrentPage = selectionTargetPage === null || selectionTargetPage === currentPageIndex;

  // Active Highlight Information (derived purely from activeAnswer & current page)
  const activeHighlight = useMemo(() => {
    if (viewDocumentType !== 'answer_sheet' || !activeAnswer) {
      console.log('[ResultsScreen OVERLAY_COMPUTE] No active answer or not answer_sheet', {
        viewDocumentType,
        hasActiveAnswer: !!activeAnswer,
        selectedType,
        selectedQuestionNumber,
        activeMappingStatus: activeMapping?.status,
      });
      return null;
    }

    const pIndex = typeof activeAnswer.pageIndex === 'number' ? activeAnswer.pageIndex : 0;
    if (pIndex !== currentPageIndex) {
      console.log('[ResultsScreen OVERLAY_COMPUTE] Active answer is on another page', {
        ansPageIndex: pIndex,
        currentPageIndex,
        selectedQuestionNumber,
      });
      return null;
    }

    const norm = extractNormalizedBbox(activeAnswer);
    const status: 'answered' | 'unanswered' | 'out_of_order' | 'unmatched' = 
      selectedType === 'unmatched' ? 'unmatched' : (activeMapping?.status || 'answered');
    
    const qLabel = selectedType === 'unmatched' 
      ? 'UNMATCHED' 
      : (activeMapping?.questionNumber || selectedQuestionNumber);

    console.log('[ResultsScreen OVERLAY_COMPUTE] Rendered Highlight Bbox:', {
      source: selectedType === 'unmatched' ? 'unmatched_item' : 'question_mapping',
      qLabel,
      activeAnswerId: activeAnswer.id,
      rawBbox: activeAnswer.bbox,
      computedNorm: norm,
      currentPageIndex,
    });

    return {
      id: activeAnswer.id || `hl_${selectedType}_${qLabel}`,
      norm,
      status,
      questionNumber: qLabel,
      text: activeAnswer.text || '',
      continuesFromPageIndex: typeof activeAnswer.continuesFromPageIndex === 'number' ? activeAnswer.continuesFromPageIndex : null,
    };
  }, [viewDocumentType, activeAnswer, activeMapping, selectedType, selectedQuestionNumber, currentPageIndex]);

  // Auto-scroll highlight into view in scrollable fit-width mode
  useEffect(() => {
    if (activeHighlight && highlightRef.current && fitMode === 'fit-width') {
      const timer = setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeHighlight, fitMode, currentPageIndex]);

  const activeDoc = viewDocumentType === 'answer_sheet' ? answerDoc : questionDoc;
  const activePages = activeDoc?.pages || [];
  const currentPage: PageImage | undefined = activePages[currentPageIndex];

  // Counts for tabs
  const answeredCount = summary?.answeredCount ?? mappings.filter(m => m.status === 'answered').length;
  const unansweredCount = summary?.unansweredCount ?? mappings.filter(m => m.status === 'unanswered').length;
  const outOfOrderCount = summary?.outOfOrderCount ?? mappings.filter(m => m.status === 'out_of_order').length;
  const unmatchedCount = summary?.unmatchedCount ?? unmatchedAnswers.length;

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-in fade-in duration-300">
      
      {/* Top Header & Metrics Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToUpload}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs border border-slate-200 dark:border-slate-800"
              title="Return to Upload Screen"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Spatial Mapping Verified
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-400" />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {answerDoc.pages.length} Answer Page(s) • {questionDoc.pages.length} Question Page(s)
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">
                Evaluation & Spatial Alignment
              </h1>
            </div>
          </div>
        </div>

        {/* Interactive Metric Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Total Questions Pill -> Resets filter to 'all' */}
          <button
            type="button"
            onClick={() => handleFilterFromHeader('all')}
            className={clsx(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer select-none active:scale-95 shadow-xs',
              activeTabFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm ring-2 ring-slate-900/20 dark:ring-white/20'
                : 'bg-slate-100 hover:bg-slate-200/90 dark:bg-slate-800 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700/70 text-slate-700 dark:text-slate-300'
            )}
            title="Click to view all questions"
          >
            <span className="font-bold">{mappings.length}</span>
            <span>Total Questions</span>
          </button>

          {/* Answered Pill -> Filters to 'answered' */}
          <button
            type="button"
            onClick={() => handleFilterFromHeader('answered')}
            className={clsx(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shadow-xs',
              activeTabFilter === 'answered'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30'
                : 'bg-emerald-50 hover:bg-emerald-100/90 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/70 border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300'
            )}
            title="Click to filter to answered questions"
          >
            <span className={clsx('h-2 w-2 rounded-full', activeTabFilter === 'answered' ? 'bg-white' : 'bg-emerald-500')} />
            <span>{answeredCount} Answered</span>
          </button>

          {/* Unanswered Pill -> Filters to 'unanswered' */}
          {unansweredCount > 0 && (
            <button
              type="button"
              onClick={() => handleFilterFromHeader('unanswered')}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shadow-xs',
                activeTabFilter === 'unanswered'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-md ring-2 ring-slate-600/30 dark:bg-slate-750'
                  : 'bg-slate-100 hover:bg-slate-200/90 dark:bg-slate-800 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              )}
              title="Click to filter to unanswered questions"
            >
              <span className={clsx('h-2 w-2 rounded-full', activeTabFilter === 'unanswered' ? 'bg-white' : 'bg-slate-400')} />
              <span>{unansweredCount} Unanswered</span>
            </button>
          )}

          {/* Out of Order Pill -> Filters to 'out_of_order' */}
          {outOfOrderCount > 0 && (
            <button
              type="button"
              onClick={() => handleFilterFromHeader('out_of_order')}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shadow-xs',
                activeTabFilter === 'out_of_order'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/30'
                  : 'bg-amber-50 hover:bg-amber-100/90 dark:bg-amber-950/50 dark:hover:bg-amber-900/70 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
              )}
              title="Click to filter to out of order questions"
            >
              <span className={clsx('h-2 w-2 rounded-full', activeTabFilter === 'out_of_order' ? 'bg-white' : 'bg-amber-500')} />
              <span>{outOfOrderCount} Out of Order</span>
            </button>
          )}

          {/* Unmatched Pill -> Scrolls to Unmatched Answers */}
          {unmatchedCount > 0 && (
            <button
              type="button"
              onClick={() => handleFilterFromHeader('unmatched')}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shadow-xs',
                activeTabFilter === 'unmatched'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30'
                  : 'bg-rose-50 hover:bg-rose-100/90 dark:bg-rose-950/50 dark:hover:bg-rose-900/70 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              )}
              title="Click to scroll to unmatched answers"
            >
              <span className={clsx('h-2 w-2 rounded-full', activeTabFilter === 'unmatched' ? 'bg-white' : 'bg-rose-500')} />
              <span>{unmatchedCount} Unmatched</span>
            </button>
          )}

          <button
            onClick={onBackToUpload}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer active:scale-95"
          >
            New Upload
          </button>
        </div>
      </div>

      {/* Prominent Low Confidence Sanity Check Banner */}
      {lowConfidenceMatch && (
        <div className="mb-6 p-5 sm:p-6 rounded-3xl bg-amber-500/10 dark:bg-amber-950/40 border-2 border-amber-500/50 dark:border-amber-600/50 shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
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
                    High Discrepancy Rate (&gt;70% unmatched/unanswered)
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-amber-100">
                  Possible Document Mismatch Detected
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-3xl">
                  {warning || 'Very few answers could be matched to this question paper. The uploaded answer sheet may not correspond to this question paper — please verify you uploaded the correct files.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onBackToUpload}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 transition-all shadow-xs flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Double Check / Re-upload Files
            </button>
          </div>
        </div>
      )}

      {/* Main 2-Column Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Scrollable Question List & Unmatched Answers (lg:col-span-5) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Question List Container */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-210px)] min-h-[640px]">
            
            {/* Search & Tabs Header */}
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search question # or text..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  onClick={() => setActiveTabFilter('all')}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer',
                    activeTabFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  )}
                >
                  All ({mappings.length})
                </button>

                <button
                  onClick={() => setActiveTabFilter('answered')}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1',
                    activeTabFilter === 'answered'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600'
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Answered ({answeredCount})
                </button>

                <button
                  onClick={() => setActiveTabFilter('unanswered')}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1',
                    activeTabFilter === 'unanswered'
                      ? 'bg-slate-700 text-white dark:bg-slate-700 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  Unanswered ({unansweredCount})
                </button>

                {outOfOrderCount > 0 && (
                  <button
                    onClick={() => setActiveTabFilter('out_of_order')}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1',
                      activeTabFilter === 'out_of_order'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600'
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Out of Order ({outOfOrderCount})
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Questions & Unmatched Section */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-100 dark:divide-slate-800/60">
              
              {/* Question Items List */}
              <div className="space-y-2.5">
                {filteredMappings.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <FileQuestion className="h-8 w-8 mx-auto stroke-1" />
                    <p className="text-xs">No questions matching filter.</p>
                  </div>
                ) : (
                  filteredMappings.map((m) => {
                    const isSelected = selectedType === 'question' && (
                      String(m.questionNumber).trim().toLowerCase() === String(selectedQuestionNumber).trim().toLowerCase() ||
                      normalizeQNum(m.questionNumber) === normalizeQNum(selectedQuestionNumber)
                    );
                    const isAnswered = m.status === 'answered';
                    const isOutOfOrder = m.status === 'out_of_order';
                    const isUnanswered = m.status === 'unanswered';
                    const ansBlock = resolveAnswerBlock(m);

                    return (
                      <div
                        key={m.id || `q_${m.questionNumber}`}
                        onClick={() => handleSelectQuestion(m)}
                        className={clsx(
                          'p-4 rounded-2xl border transition-all duration-200 cursor-pointer relative overflow-hidden group',
                          isSelected
                            ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/30 shadow-md'
                            : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800/70 hover:bg-white dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                        )}
                      >
                        {/* Header: Question Number + Status Badge */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white font-mono flex items-center gap-1.5">
                              <span className={clsx('h-2 w-2 rounded-full', isSelected ? 'bg-indigo-600' : 'bg-indigo-400')} />
                              Q.{m.questionNumber}
                            </span>
                            {m.question.maxMarks && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                [{m.question.maxMarks} Marks]
                              </span>
                            )}
                          </div>

                          {/* Status Badge */}
                          {isAnswered && (
                            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 shadow-xs">
                              <Check className="h-3 w-3" />
                              Answered
                            </span>
                          )}

                          {isOutOfOrder && (
                            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1 shadow-xs">
                              <Clock className="h-3 w-3" />
                              Out of Order
                            </span>
                          )}

                          {isUnanswered && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700">
                              Unanswered
                            </span>
                          )}
                        </div>

                        {/* Question Text Preview */}
                        <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">
                          {m.question.text || 'Question text not available'}
                        </p>

                        {/* Matched Answer Snippet */}
                        {ansBlock && (
                          <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/80 flex items-start justify-between gap-3 text-[11px]">
                            <div className="flex items-start gap-1.5 text-slate-500 dark:text-slate-400 line-clamp-1 italic">
                              <span className="text-indigo-600 dark:text-indigo-400 not-italic font-semibold shrink-0">↳ OCR:</span>
                              <span>"{ansBlock.text}"</span>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-100/80 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                              Page {(ansBlock.pageIndex ?? 0) + 1}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* UNMATCHED ANSWERS SECTION (Requirement #4) */}
              {unmatchedAnswers.length > 0 && (
                <div ref={unmatchedSectionRef} id="unmatched-answers-section" className="pt-4 space-y-3 scroll-mt-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-rose-500" />
                      Unmatched Answers ({unmatchedAnswers.length})
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      No question assigned
                    </span>
                  </div>

                  <div className="space-y-2">
                    {unmatchedAnswers.map((uAns, idx) => {
                      const isSelected = selectedType === 'unmatched' && selectedUnmatchedId === uAns.id;

                      return (
                        <div
                          key={uAns.id || `unmatched_${idx}`}
                          onClick={() => handleSelectUnmatched(uAns)}
                          className={clsx(
                            'p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer relative',
                            isSelected
                              ? 'bg-rose-50/90 dark:bg-rose-950/50 border-rose-500 dark:border-rose-500 ring-2 ring-rose-500/30 shadow-md'
                              : 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/50 hover:bg-rose-50/60 dark:hover:bg-rose-950/30'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold text-rose-700 dark:text-rose-300 font-mono">
                              Block #{idx + 1}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-200/60 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-medium">
                              Page {(uAns.pageIndex ?? 0) + 1}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 italic">
                            "{uAns.text || 'Extra handwritten text'}"
                          </p>
                          <div className="mt-2 text-[10px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                            <span>⚠ Unmatched — no corresponding question found</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Full-Height Page Viewer & Dynamic Highlight Canvas (lg:col-span-7) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          
          {/* Main Viewer Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-210px)] min-h-[640px]">
            
            {/* Viewer Navigation & Controls Toolbar */}
            <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/70">
              
              {/* Document Type Selector (Answer Sheet vs Question Paper) */}
              <div className="flex items-center p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setViewDocumentType('answer_sheet');
                  }}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
                    viewDocumentType === 'answer_sheet'
                      ? 'bg-white dark:bg-slate-950 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  )}
                >
                  <ScanText className="h-3.5 w-3.5" />
                  Answer Sheet ({answerDoc.pages.length}p)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewDocumentType('question_paper');
                  }}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
                    viewDocumentType === 'question_paper'
                      ? 'bg-white dark:bg-slate-950 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  )}
                >
                  <FileQuestion className="h-3.5 w-3.5" />
                  Question Paper ({questionDoc.pages.length}p)
                </button>
              </div>

              {/* Viewport Sizing Modes & Zoom Controls */}
              <div className="flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFitMode('fit-page');
                    setZoomScale(100);
                  }}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1',
                    fitMode === 'fit-page'
                      ? 'bg-white dark:bg-slate-950 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  )}
                  title="Scale full page to fit viewport height (no cutoff)"
                >
                  <Minimize2 className="h-3 w-3" />
                  <span>Fit Page</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFitMode('fit-width');
                    setZoomScale(100);
                  }}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1',
                    fitMode === 'fit-width'
                      ? 'bg-white dark:bg-slate-950 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  )}
                  title="Full width page with vertical scroll"
                >
                  <Maximize2 className="h-3 w-3" />
                  <span>Full Width</span>
                </button>

                <div className="h-3 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setZoomScale(prev => Math.max(50, prev - 15))}
                  className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>

                <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 min-w-[32px] text-center">
                  {zoomScale}%
                </span>

                <button
                  type="button"
                  onClick={() => setZoomScale(prev => Math.min(200, prev + 15))}
                  className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Page Navigator Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPageIndex <= 0}
                  onClick={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-700 dark:text-slate-300 cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 px-1">
                  {currentPageIndex + 1} / {Math.max(1, activePages.length)}
                </span>

                <button
                  type="button"
                  disabled={currentPageIndex >= activePages.length - 1}
                  onClick={() => setCurrentPageIndex(prev => Math.min(activePages.length - 1, prev + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-700 dark:text-slate-300 cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Notification when Selection is on a different page */}
            {!isSelectionOnCurrentPage && selectionTargetPage !== null && (
              <div className="m-3 p-3 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/40 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in shrink-0">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    Selected {selectedType === 'question' ? `Question ${selectedQuestionNumber}` : 'Unmatched Answer'} is located on <strong>Page {selectionTargetPage + 1}</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentPageIndex(selectionTargetPage)}
                  className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shadow-xs cursor-pointer shrink-0"
                >
                  Jump to Page {selectionTargetPage + 1} →
                </button>
              </div>
            )}

            {/* Inline Unanswered State Banner */}
            {selectedType === 'question' && activeMapping?.status === 'unanswered' && viewDocumentType === 'answer_sheet' && (
              <div className="m-4 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-start gap-3.5 animate-in fade-in shrink-0">
                <div className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    No answer found for Question {activeMapping.questionNumber}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    The student did not attempt this question or left it blank. No handwriting block matched this question in the answer sheet.
                  </p>
                </div>
              </div>
            )}

            {/* Document Canvas Container with Dynamic Height, Vertical Scroll, and Highlight Box */}
            <div 
              ref={containerRef}
              className="relative p-4 sm:p-6 flex-1 flex justify-center items-start bg-slate-100/70 dark:bg-slate-950/70 overflow-y-auto overflow-x-auto min-h-0"
            >
              {currentPage ? (
                <div 
                  className="relative inline-block shadow-2xl rounded-xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 transition-transform duration-150"
                  style={{
                    transform: zoomScale !== 100 ? `scale(${zoomScale / 100})` : undefined,
                    transformOrigin: 'top center',
                  }}
                >
                  <img
                    ref={imageRef}
                    src={currentPage.dataUrl}
                    alt={`Page ${currentPageIndex + 1}`}
                    onLoad={handleImageLoad}
                    className={clsx(
                      'block select-none max-w-full transition-all duration-200',
                      fitMode === 'fit-page'
                        ? 'max-h-[calc(100vh-340px)] w-auto h-auto object-contain'
                        : 'w-full max-w-[880px] h-auto'
                    )}
                  />

                  {/* SINGLE PERMANENT HIGHLIGHT OVERLAY (Exists once in DOM, style updates directly in place on every render) */}
                  <div
                    id="vedai-spatial-highlight-overlay"
                    ref={highlightRef}
                    style={{
                      display: activeHighlight ? 'block' : 'none',
                      top: activeHighlight ? `${activeHighlight.norm.ymin * 100}%` : '0%',
                      left: activeHighlight ? `${activeHighlight.norm.xmin * 100}%` : '0%',
                      width: activeHighlight ? `${Math.max(4, (activeHighlight.norm.xmax - activeHighlight.norm.xmin) * 100)}%` : '0%',
                      height: activeHighlight ? `${Math.max(2.5, (activeHighlight.norm.ymax - activeHighlight.norm.ymin) * 100)}%` : '0%',
                      minWidth: activeHighlight ? 70 : 0,
                      minHeight: activeHighlight ? 28 : 0,
                      opacity: activeHighlight ? 1 : 0,
                      pointerEvents: activeHighlight ? 'auto' : 'none',
                    }}
                    className={clsx(
                      'absolute rounded-xl border-[3px] transition-all duration-300 ease-out z-30',
                      activeHighlight?.status === 'answered' && 'border-emerald-500 bg-emerald-500/25 ring-4 ring-emerald-500/30 shadow-2xl shadow-emerald-500/40',
                      activeHighlight?.status === 'out_of_order' && 'border-amber-500 bg-amber-500/25 ring-4 ring-amber-500/30 shadow-2xl shadow-amber-500/40',
                      activeHighlight?.status === 'unmatched' && 'border-rose-500 bg-rose-500/30 ring-4 ring-rose-500/30 shadow-2xl shadow-rose-500/40'
                    )}
                  >
                    {activeHighlight && (
                      <>
                        {/* Top Label Tag */}
                        <div
                          className={clsx(
                            'absolute -top-7 left-0 px-2.5 py-1 rounded-t-lg text-[11px] font-extrabold text-white whitespace-nowrap shadow-md flex items-center gap-2 pointer-events-none',
                            activeHighlight.status === 'answered' && 'bg-emerald-600',
                            activeHighlight.status === 'out_of_order' && 'bg-amber-600',
                            activeHighlight.status === 'unmatched' && 'bg-rose-600'
                          )}
                        >
                          <span>
                            {activeHighlight.status === 'unmatched'
                              ? '⚠️ Unmatched Answer Block'
                              : `Q.${activeHighlight.questionNumber}`}
                          </span>

                          {activeHighlight.status === 'out_of_order' && (
                            <span className="text-[9px] bg-amber-900/70 px-1 rounded uppercase font-semibold">
                              Out of Order
                            </span>
                          )}
                        </div>

                        {/* Multi-Page Continuation Chip */}
                        {typeof activeHighlight.continuesFromPageIndex === 'number' && (
                          <button
                            type="button"
                            onClick={() => {
                              const targetP = activeHighlight.continuesFromPageIndex!;
                              setCurrentPageIndex(targetP);
                            }}
                            className="absolute -bottom-8 right-0 px-3 py-1.5 rounded-b-lg bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[10px] font-extrabold shadow-lg transition-all flex items-center gap-1 cursor-pointer z-40"
                            title={`Jump to Page ${activeHighlight.continuesFromPageIndex + 1}`}
                          >
                            <span>↳ Continued from Page {activeHighlight.continuesFromPageIndex + 1}</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
                  <Layers className="h-12 w-12 stroke-1" />
                  <p className="text-xs">No pages rendered for this document.</p>
                </div>
              )}
            </div>

            {/* Bottom Info Status Bar */}
            <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-white">Active Selection:</span>
                {selectedType === 'question' && activeMapping ? (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      Question {activeMapping.questionNumber} ({activeMapping.status})
                    </span>
                    {selectionTargetPage !== null && (
                      <span className={clsx(
                        'text-[11px] px-2 py-0.5 rounded font-mono',
                        isSelectionOnCurrentPage
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                      )}>
                        {isSelectionOnCurrentPage ? `Visible on Page ${currentPageIndex + 1}` : `Located on Page ${selectionTargetPage + 1}`}
                      </span>
                    )}
                  </div>
                ) : selectedType === 'unmatched' && activeUnmatched ? (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-rose-600 dark:text-rose-400">
                      Unmatched Answer Block #{unmatchedAnswers.findIndex(u => u.id === activeUnmatched.id) + 1}
                    </span>
                    <span className={clsx(
                      'text-[11px] px-2 py-0.5 rounded font-mono',
                      isSelectionOnCurrentPage
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                    )}>
                      {isSelectionOnCurrentPage ? `Visible on Page ${currentPageIndex + 1}` : `Located on Page ${(activeUnmatched.pageIndex ?? 0) + 1}`}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-500">None</span>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                <span>Mode: {fitMode === 'fit-page' ? 'Full Page Fit' : 'Full Width Scroll'}</span>
                {selectedType === 'question' && activeMapping?.matchReason && (
                  <span>• {activeMapping.matchReason}</span>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
