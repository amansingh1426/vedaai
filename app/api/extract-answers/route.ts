import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { withTimeout, classifyGeminiError, serializeError, ApiErrorResponse } from '@/lib/apiHelper';
import { callGeminiWithFallback } from '@/lib/geminiConfig';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Up to 60 seconds execution for Vercel Serverless Functions

export interface RawBbox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface ExtractedAnswerBlock {
  id: string;
  questionNumberGuess: string | null;
  text: string;
  pageIndex: number;
  bbox: RawBbox;
  // Normalized 0-1 x, y, width, height for UI overlay rendering
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  continuesFromPageIndex: number | null;
}

const SYSTEM_INSTRUCTION = `You are analyzing a handwritten student answer sheet. Identify each distinct answer block written on the page — a student may write answers out of order, skip questions, or write extra content that doesn't correspond to any question. For each block: 1) transcribe the handwritten text as accurately as possible, 2) guess which question number it's answering based on any number the student wrote next to it (may be missing or wrong), 3) return a bounding box in normalized coordinates [0,1] for exactly where that block of handwriting sits on the page (ymin, xmin, ymax, xmax), 4) note the page index. If an answer clearly continues from a previous page, mark it with a continuesFromPageIndex field. Return strict JSON only: [{ "questionNumberGuess": string|null, "text": string, "pageIndex": number, "bbox": {"ymin":0-1,"xmin":0-1,"ymax":0-1,"xmax":0-1}, "continuesFromPageIndex": number|null }]`;

const ANSWERS_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      questionNumberGuess: {
        type: Type.STRING,
        nullable: true,
        description: 'Question number or subpart label written near this answer (e.g., "1", "2", "3(a)", "11(a)"), or null if absent/unclear',
      },
      text: {
        type: Type.STRING,
        description: 'Transcribed handwritten text of this answer block',
      },
      pageIndex: {
        type: Type.INTEGER,
        description: '0-based page index where this answer block appears',
      },
      bbox: {
        type: Type.OBJECT,
        properties: {
          ymin: { type: Type.NUMBER, description: 'Normalized top coordinate [0, 1]' },
          xmin: { type: Type.NUMBER, description: 'Normalized left coordinate [0, 1]' },
          ymax: { type: Type.NUMBER, description: 'Normalized bottom coordinate [0, 1]' },
          xmax: { type: Type.NUMBER, description: 'Normalized right coordinate [0, 1]' },
        },
        required: ['ymin', 'xmin', 'ymax', 'xmax'],
      },
      continuesFromPageIndex: {
        type: Type.INTEGER,
        nullable: true,
        description: 'Page index this answer continues from if multi-page, or null',
      },
    },
    required: ['text', 'pageIndex', 'bbox'],
  },
};

/**
 * Normalizes coordinate value to [0, 1] range safely
 */
function normalizeCoord(val: any, fallback: number): number {
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return fallback;
  if (num > 1.0) {
    return Math.max(0, Math.min(1, num / 1000));
  }
  return Math.max(0, Math.min(1, num));
}

/**
 * Robust JSON parser that handles arrays, wrapped objects, markdown fences, and normalizes bboxes
 */
function parseAnswersJson(raw: string): ExtractedAnswerBlock[] {
  console.log('[VedaAI Gemini Answer OCR Output (Length: %d)]', raw ? raw.length : 0);
  if (!raw || typeof raw !== 'string') {
    const err = new Error('Empty or undefined response received from Gemini model.');
    (err as any).code = 'PARSE_ERROR';
    throw err;
  }

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        parsed = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
      } catch (innerErr) {
        const parseErr = new Error(`JSON Array Slice Parse Failed: ${err.message}. Raw: "${cleaned.slice(0, 150)}..."`);
        (parseErr as any).code = 'PARSE_ERROR';
        throw parseErr;
      }
    } else {
      const parseErr = new Error(`Invalid JSON format: ${err.message}. Raw snippet: "${cleaned.slice(0, 150)}..."`);
      (parseErr as any).code = 'PARSE_ERROR';
      throw parseErr;
    }
  }

  let list: any[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const candidate = parsed.answers || parsed.answerBlocks || parsed.items || parsed.data || parsed.results || Object.values(parsed).find(v => Array.isArray(v));
    if (Array.isArray(candidate)) {
      list = candidate;
    }
  }

  if (!Array.isArray(list)) {
    const err = new Error('Parsed JSON structure is not an array of answer blocks');
    (err as any).code = 'PARSE_ERROR';
    throw err;
  }

  return list.map((item: any, idx: number): ExtractedAnswerBlock => {
    const pageIndex = typeof item.pageIndex === 'number' ? item.pageIndex : 0;
    
    let ymin = 0;
    let xmin = 0;
    let ymax = 0.2;
    let xmax = 0.9;

    if (item.bbox && typeof item.bbox === 'object') {
      ymin = normalizeCoord(item.bbox.ymin ?? item.bbox.yMin ?? item.bbox.top, 0);
      xmin = normalizeCoord(item.bbox.xmin ?? item.bbox.xMin ?? item.bbox.left, 0);
      ymax = normalizeCoord(item.bbox.ymax ?? item.bbox.yMax ?? item.bbox.bottom, ymin + 0.15);
      xmax = normalizeCoord(item.bbox.xmax ?? item.bbox.xMax ?? item.bbox.right, xmin + 0.8);
    } else if (Array.isArray(item.box_2d) && item.box_2d.length === 4) {
      ymin = normalizeCoord(item.box_2d[0], 0);
      xmin = normalizeCoord(item.box_2d[1], 0);
      ymax = normalizeCoord(item.box_2d[2], 0.2);
      xmax = normalizeCoord(item.box_2d[3], 0.9);
    }

    if (ymax <= ymin) ymax = Math.min(1, ymin + 0.1);
    if (xmax <= xmin) xmax = Math.min(1, xmin + 0.3);

    const questionGuess = item.questionNumberGuess 
      ? String(item.questionNumberGuess).trim() 
      : (item.questionNumber ? String(item.questionNumber).trim() : null);

    return {
      id: `ans_${pageIndex}_${idx + 1}_${Math.random().toString(36).substring(2, 7)}`,
      questionNumberGuess: questionGuess || null,
      text: String(item.text || '').trim(),
      pageIndex,
      bbox: { ymin, xmin, ymax, xmax },
      box: {
        x: xmin,
        y: ymin,
        width: Math.max(0.05, xmax - xmin),
        height: Math.max(0.03, ymax - ymin),
      },
      continuesFromPageIndex: typeof item.continuesFromPageIndex === 'number' ? item.continuesFromPageIndex : null,
    };
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    let body: any;
    try {
      body = await req.json();
    } catch (err: any) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: 'Invalid JSON request payload',
          code: 'INVALID_INPUT',
          statusCode: 400,
          details: err?.message,
        },
        { status: 400 }
      );
    }

    const { pages } = body as { pages: { dataUrl: string; pageIndex: number }[] };

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: 'Invalid payload: pages array is required with at least one answer sheet page image.',
          code: 'INVALID_INPUT',
          statusCode: 400,
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: 'Gemini API Key is missing. Please set GEMINI_API_KEY in your .env.local file.',
          code: 'MISSING_API_KEY',
          isAuthError: true,
          statusCode: 500,
        },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const imageParts = pages.map((page) => {
      const match = page.dataUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
      const mimeType = match ? match[1] : 'image/jpeg';
      const base64Data = match ? match[2] : page.dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

      return {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };
    });

    const userPrompt = {
      text: `Analyze all attached ${pages.length} handwritten student answer sheet page(s). Detect every distinct answer block, transcribe the text, guess the question number, determine normalized bounding boxes [0-1], and identify cross-page continuations conforming to the JSON schema. Total pages: ${pages.length}.`,
    };

    const callGeminiSingle = async (model: string) => {
      const contents = [...imageParts, userPrompt];
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: ANSWERS_SCHEMA,
          temperature: 0.1,
        },
      });

      return response.text || '';
    };

    // 45s timeout for Answer OCR and bounding box detection with confirmed fallback models
    const rawText = await withTimeout(
      callGeminiWithFallback('Handwritten Answer OCR', callGeminiSingle),
      45000,
      `Handwritten Answer Sheet extraction (${pages.length} pages)`
    );

    const answerBlocks = parseAnswersJson(rawText);
    const elapsedMs = Date.now() - startTime;

    const detectedGuesses = answerBlocks
      .map((b) => b.questionNumberGuess)
      .filter((g): g is string => Boolean(g));

    console.log(`[VedaAI] Stage 2 Answer Extraction Succeeded in ${(elapsedMs / 1000).toFixed(1)}s: ${answerBlocks.length} answer blocks detected.`);

    return NextResponse.json({
      success: true,
      answers: answerBlocks,
      totalCount: answerBlocks.length,
      detectedGuesses,
      pagesProcessed: pages.length,
      elapsedMs,
    });
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    const serializedErr = serializeError(error);
    console.error(`[VedaAI /api/extract-answers Failed after ${(elapsedMs / 1000).toFixed(1)}s]:`, serializedErr);
    
    const classified = classifyGeminiError(error, elapsedMs);

    return NextResponse.json<ApiErrorResponse>(
      {
        success: false,
        error: classified.error,
        code: classified.code,
        statusCode: classified.statusCode,
        elapsedMs,
        isRateLimit: classified.isRateLimit,
        isAuthError: classified.isAuthError,
        isTimeout: classified.isTimeout,
        isParseError: classified.isParseError,
        details: classified.details,
        rawError: classified.rawError,
      },
      { status: classified.statusCode }
    );
  }
}
