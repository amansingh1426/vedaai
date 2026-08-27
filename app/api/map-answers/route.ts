import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { withTimeout, classifyGeminiError, serializeError, ApiErrorResponse } from '@/lib/apiHelper';
import { callGeminiWithFallback } from '@/lib/geminiConfig';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Up to 60 seconds execution for Vercel Serverless Functions

export interface RawInputQuestion {
  id?: string;
  number: string;
  text: string;
  pageIndex?: number;
  maxMarks?: number;
}

export interface RawInputAnswerBlock {
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
  continuesFromPageIndex?: number | null;
}

export interface FinalQuestionMapping {
  id: string;
  questionNumber: string;
  question: RawInputQuestion;
  answerBlockId: string | null;
  answer: RawInputAnswerBlock | null;
  status: 'answered' | 'unanswered' | 'out_of_order';
  matchReason?: string;
}

const SYSTEM_INSTRUCTION = `You are an intelligent exam evaluator assistant.
You will receive a list of exam questions (with exact numbers) and a list of handwritten answer blocks (each with a guessed question number, which may be null, wrong, or mismatched).
For each remaining question, find the best-matching answer block using the guessed number AND the semantic content of the answer relative to the question text.

Rules:
1) A question with no plausible matching answer block is 'unanswered'.
2) An answer block that doesn't correspond to any real question is 'unmatched'.
3) If an answer's guessed number doesn't match its actual correct question, still map it correctly and mark status 'out_of_order'.
4) Never fabricate an answer's content — only reference provided answer block IDs by their given id field.
Return strict JSON conforming to schema: { "mappings": [{ "questionNumber": string, "answerBlockId": string|null, "status": "answered"|"unanswered"|"out_of_order" }], "unmatchedAnswers": [answerBlockId, ...] }`;

const MAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mappings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionNumber: { type: Type.STRING },
          answerBlockId: { type: Type.STRING, nullable: true },
          status: {
            type: Type.STRING,
            enum: ['answered', 'unanswered', 'out_of_order'],
          },
        },
        required: ['questionNumber', 'status'],
      },
    },
    unmatchedAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'IDs of answer blocks that do not map to any question',
    },
  },
  required: ['mappings', 'unmatchedAnswers'],
};

/**
 * Normalizes question numbers for robust string comparison
 */
function normalizeQNum(str?: string | null): string {
  if (!str) return '';
  let s = String(str)
    .toLowerCase()
    .replace(/^q(?:uestion)?[\s.:#-]*/i, '')
    .replace(/^ans(?:wer)?[\s.:#-]*/i, '')
    .replace(/^sec(?:tion)?[\s.:#-]*/i, '')
    .replace(/[\s.-]/g, '')
    .trim();
  
  s = s.replace(/^0+([1-9])/g, '$1');
  return s;
}

/**
 * Defensive JSON parsing for AI mapping response
 */
function parseAiMappingJson(raw: string): {
  mappings: { questionNumber: string; answerBlockId: string | null; status: 'answered' | 'unanswered' | 'out_of_order' }[];
  unmatchedAnswers: string[];
} {
  console.log('[VedaAI Gemini Map-Answers Output (Length: %d)]', raw ? raw.length : 0);
  if (!raw || typeof raw !== 'string') {
    const err = new Error('Empty or undefined response received from Gemini model during mapping.');
    (err as any).code = 'PARSE_ERROR';
    throw err;
  }

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (innerErr) {
        const parseErr = new Error(`JSON Object Slice Parse Failed: ${err.message}. Raw: "${cleaned.slice(0, 150)}..."`);
        (parseErr as any).code = 'PARSE_ERROR';
        throw parseErr;
      }
    } else {
      const parseErr = new Error(`Invalid JSON format: ${err.message}. Raw: "${cleaned.slice(0, 150)}..."`);
      (parseErr as any).code = 'PARSE_ERROR';
      throw parseErr;
    }
  }

  const mappings = Array.isArray(parsed?.mappings)
    ? parsed.mappings.map((m: any) => ({
        questionNumber: String(m.questionNumber || '').trim(),
        answerBlockId: m.answerBlockId ? String(m.answerBlockId).trim() : null,
        status: (['answered', 'unanswered', 'out_of_order'].includes(m.status) ? m.status : (m.answerBlockId ? 'answered' : 'unanswered')) as 'answered' | 'unanswered' | 'out_of_order',
      }))
    : [];

  const unmatchedAnswers = Array.isArray(parsed?.unmatchedAnswers)
    ? parsed.unmatchedAnswers.map((id: any) => String(id).trim())
    : [];

  return { mappings, unmatchedAnswers };
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

    const questions: RawInputQuestion[] = body.questions || [];
    const answers: RawInputAnswerBlock[] = body.answers || [];

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: 'Invalid payload: questions array is required.',
          code: 'INVALID_INPUT',
          statusCode: 400,
        },
        { status: 400 }
      );
    }

    // Index answers by ID
    const answerMap = new Map<string, RawInputAnswerBlock>();
    answers.forEach((ans, idx) => {
      if (!ans.id) {
        ans.id = `ans_${idx + 1}`;
      }
      answerMap.set(ans.id, ans);
    });

    // ==========================================
    // STEP 1: Deterministic High-Confidence Pre-Match
    // ==========================================
    const resolvedMappings = new Map<string, FinalQuestionMapping>();
    const assignedAnswerBlockIds = new Set<string>();
    const assignedQuestionNumbers = new Set<string>();

    for (const q of questions) {
      const qNorm = normalizeQNum(q.number);
      if (!qNorm) continue;

      const exactMatch = answers.find(
        (a) => !assignedAnswerBlockIds.has(a.id) && normalizeQNum(a.questionNumberGuess) === qNorm
      );

      if (exactMatch) {
        assignedAnswerBlockIds.add(exactMatch.id);
        assignedQuestionNumbers.add(q.number);
        resolvedMappings.set(q.number, {
          id: `map_${q.number}`,
          questionNumber: q.number,
          question: q,
          answerBlockId: exactMatch.id,
          answer: exactMatch,
          status: 'answered',
          matchReason: 'Exact question number string match',
        });
      }
    }

    const unresolvedQuestions = questions.filter((q) => !assignedQuestionNumbers.has(q.number));
    const unresolvedAnswers = answers.filter((a) => !assignedAnswerBlockIds.has(a.id));

    console.log(
      `[VedaAI Mapping] Step 1 Pre-matched ${assignedQuestionNumbers.size}/${questions.length} questions. ` +
      `Unresolved: ${unresolvedQuestions.length} questions, ${unresolvedAnswers.length} answers.`
    );

    // ==========================================
    // STEP 2: AI-Assisted Resolution for Remainder
    // ==========================================
    let aiMappings: { questionNumber: string; answerBlockId: string | null; status: 'answered' | 'unanswered' | 'out_of_order' }[] = [];
    let aiUnmatchedIds: string[] = [];

    if (unresolvedQuestions.length > 0 && unresolvedAnswers.length > 0) {
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

      const promptPayload = {
        unresolvedQuestions: unresolvedQuestions.map((q) => ({
          number: q.number,
          text: q.text,
          pageIndex: q.pageIndex ?? 0,
        })),
        unresolvedAnswerBlocks: unresolvedAnswers.map((a) => ({
          id: a.id,
          questionNumberGuess: a.questionNumberGuess || null,
          text: a.text,
          pageIndex: a.pageIndex ?? 0,
        })),
      };

      const userMessage = `Resolve and map the following remaining exam questions to the available handwritten answer blocks based on question text, answer content, and guessed labels.\n\nInput Data:\n${JSON.stringify(promptPayload, null, 2)}`;

      const callGeminiSingle = async (model: string) => {
        const contents = [{ text: userMessage }];
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: MAP_SCHEMA,
            temperature: 0.1,
          },
        });
        return response.text || '';
      };

      // 45s timeout for AI Answer Mapping resolution with confirmed fallback models
      const rawAiOutput = await withTimeout(
        callGeminiWithFallback('AI Semantic Answer Mapping', callGeminiSingle),
        45000,
        'AI Answer Mapping resolution'
      );
      const parsed = parseAiMappingJson(rawAiOutput);
      aiMappings = parsed.mappings;
      aiUnmatchedIds = parsed.unmatchedAnswers;
    } else if (unresolvedQuestions.length > 0 && unresolvedAnswers.length === 0) {
      unresolvedQuestions.forEach((q) => {
        aiMappings.push({
          questionNumber: q.number,
          answerBlockId: null,
          status: 'unanswered',
        });
      });
    }

    // ==========================================
    // STEP 3: Merge Step 1 + Step 2 into Final Mapping
    // ==========================================
    aiMappings.forEach((aiMap) => {
      const q = questions.find(
        (question) =>
          question.number.toLowerCase() === aiMap.questionNumber.toLowerCase() ||
          normalizeQNum(question.number) === normalizeQNum(aiMap.questionNumber)
      );

      if (q && !resolvedMappings.has(q.number)) {
        let matchedAns: RawInputAnswerBlock | null = null;
        if (aiMap.answerBlockId && !assignedAnswerBlockIds.has(aiMap.answerBlockId)) {
          matchedAns = answerMap.get(aiMap.answerBlockId) || null;
          if (matchedAns) {
            assignedAnswerBlockIds.add(matchedAns.id);
          }
        }

        const finalStatus = matchedAns ? (aiMap.status || 'answered') : 'unanswered';

        resolvedMappings.set(q.number, {
          id: `map_${q.number}`,
          questionNumber: q.number,
          question: q,
          answerBlockId: matchedAns ? matchedAns.id : null,
          answer: matchedAns,
          status: finalStatus,
          matchReason: matchedAns ? 'AI semantic alignment & spatial resolution' : 'No matching answer detected in sheet',
        });
      }
    });

    const finalMappings: FinalQuestionMapping[] = questions.map((q) => {
      const existing = resolvedMappings.get(q.number);
      if (existing) return existing;

      return {
        id: `map_${q.number}`,
        questionNumber: q.number,
        question: q,
        answerBlockId: null,
        answer: null,
        status: 'unanswered',
        matchReason: 'Unanswered by student',
      };
    });

    const finalUnmatchedAnswers: RawInputAnswerBlock[] = answers.filter(
      (a) => !assignedAnswerBlockIds.has(a.id)
    );

    const answeredCount = finalMappings.filter((m) => m.status === 'answered').length;
    const unansweredCount = finalMappings.filter((m) => m.status === 'unanswered').length;
    const outOfOrderCount = finalMappings.filter((m) => m.status === 'out_of_order').length;
    const unmatchedCount = finalUnmatchedAnswers.length;

    const unansweredPct = questions.length > 0 ? (unansweredCount / questions.length) * 100 : 0;
    const unmatchedPct = answers.length > 0 ? (unmatchedCount / answers.length) * 100 : 0;

    const lowConfidenceMatch = unansweredPct > 70 && unmatchedPct > 70;
    const warning = lowConfidenceMatch
      ? 'Very few answers could be matched to this question paper. The uploaded answer sheet may not correspond to this question paper — please verify you uploaded the correct files.'
      : null;

    const summary = {
      totalQuestions: questions.length,
      totalAnswersExtracted: answers.length,
      answeredCount,
      unansweredCount,
      outOfOrderCount,
      unmatchedCount,
      unansweredPct: Math.round(unansweredPct),
      unmatchedPct: Math.round(unmatchedPct),
      lowConfidenceMatch,
      warning,
    };

    const elapsedMs = Date.now() - startTime;
    console.log(`[VedaAI] Stage 3 Spatial Mapping Succeeded in ${(elapsedMs / 1000).toFixed(1)}s`, summary);

    return NextResponse.json({
      success: true,
      mappings: finalMappings,
      unmatchedAnswers: finalUnmatchedAnswers,
      summary,
      lowConfidenceMatch,
      warning,
      elapsedMs,
    });
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    const serializedErr = serializeError(error);
    console.error(`[VedaAI /api/map-answers Failed after ${(elapsedMs / 1000).toFixed(1)}s]:`, serializedErr);
    
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
