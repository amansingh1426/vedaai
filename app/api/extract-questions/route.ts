import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { withTimeout, classifyGeminiError, serializeError, ApiErrorResponse } from '@/lib/apiHelper';
import { callGeminiWithFallback } from '@/lib/geminiConfig';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Up to 60 seconds execution for Vercel Serverless Functions

export interface ExtractedQuestion {
  number: string;
  text: string;
  pageIndex: number;
}

const SYSTEM_INSTRUCTION = `You are a precise document extraction system for academic exam question papers.
Your task is to extract every single question and sub-question from the provided question paper page image(s) in exact printed order.

CRITICAL RULES:
1. Extract EVERY question in the exact order it appears.
2. Treat labelled sub-parts (e.g. 11(a), 11(b), 1(i), 1(ii), Q3a, Q3b) as separate distinct entries.
3. Preserve the original numbering and labelling format EXACTLY in the "number" field (e.g. "1", "2", "3(a)", "3(b)", "11(a)", "11(b)").
4. Include the complete text of the question in the "text" field, including any marks or point values indicated (e.g. "[5 marks]").
5. Set "pageIndex" to the 0-based page index of the page where the question appears (Page 1 = 0, Page 2 = 1, etc.).
6. Return strictly a JSON array of objects conforming to the schema.`;

const QUESTIONS_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      number: {
        type: Type.STRING,
        description: 'Question or sub-part identifier exactly as printed (e.g. "1", "2", "11(a)", "11(b)")',
      },
      text: {
        type: Type.STRING,
        description: 'Full text of the question, including any mark weights if specified',
      },
      pageIndex: {
        type: Type.INTEGER,
        description: '0-based page index where this question appears',
      },
    },
    required: ['number', 'text', 'pageIndex'],
  },
};

/**
 * Robust JSON parser that handles arrays, wrapped objects, and markdown fences
 */
function parseQuestionsJson(raw: string): ExtractedQuestion[] {
  console.log('[VedaAI Gemini Raw Output (Length: %d)]', raw ? raw.length : 0);
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
        const parseErr = new Error(`JSON Slice Parse Failed: ${err.message}. Raw snippet: "${cleaned.slice(0, 150)}..."`);
        (parseErr as any).code = 'PARSE_ERROR';
        throw parseErr;
      }
    } else {
      const parseErr = new Error(`Invalid JSON format: ${err.message}. Raw snippet: "${cleaned.slice(0, 150)}..."`);
      (parseErr as any).code = 'PARSE_ERROR';
      throw parseErr;
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.map((item, idx) => ({
      number: String(item.number || idx + 1).trim(),
      text: String(item.text || '').trim(),
      pageIndex: typeof item.pageIndex === 'number' ? item.pageIndex : 0,
    }));
  }

  if (parsed && typeof parsed === 'object') {
    const list = parsed.questions || parsed.items || parsed.data || parsed.results || Object.values(parsed).find(v => Array.isArray(v));
    if (Array.isArray(list)) {
      return list.map((item: any, idx: number) => ({
        number: String(item.number || idx + 1).trim(),
        text: String(item.text || '').trim(),
        pageIndex: typeof item.pageIndex === 'number' ? item.pageIndex : 0,
      }));
    }
  }

  const err = new Error('Parsed JSON structure is not an array of questions.');
  (err as any).code = 'PARSE_ERROR';
  throw err;
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
          error: 'Invalid payload: pages array is required with at least one page image.',
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

    // Prepare contents array with image parts for each page
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
      text: `Extract all questions from the attached ${pages.length} question paper page(s) in printed sequence as JSON conforming to the requested schema. Total pages: ${pages.length}.`,
    };

    const callGeminiSingle = async (model: string) => {
      const contents = [...imageParts, userPrompt];
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: QUESTIONS_SCHEMA,
          temperature: 0.1,
        },
      });

      return response.text || '';
    };

    // 45s timeout for Question Paper extraction with confirmed fallback models
    const rawText = await withTimeout(
      callGeminiWithFallback('Question Paper Extraction', callGeminiSingle),
      45000,
      `Question Paper extraction (${pages.length} pages)`
    );

    const questions = parseQuestionsJson(rawText);
    const elapsedMs = Date.now() - startTime;

    // Identify subparts (e.g., 11(a), 3(b), 1.2)
    const subparts = questions.filter(q => /[a-zA-Z]|\(|\)/.test(q.number) && !/^[0-9]+$/.test(q.number));
    const subpartLabels = subparts.map(q => q.number);

    console.log(`[VedaAI] Stage 1 Question Extraction Succeeded in ${(elapsedMs / 1000).toFixed(1)}s: ${questions.length} questions extracted.`);

    return NextResponse.json({
      success: true,
      questions,
      totalCount: questions.length,
      subpartsCount: subparts.length,
      subpartLabels,
      elapsedMs,
    });
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    const serializedErr = serializeError(error);
    console.error(`[VedaAI /api/extract-questions Failed after ${(elapsedMs / 1000).toFixed(1)}s]:`, serializedErr);
    
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
