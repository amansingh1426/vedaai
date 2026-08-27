export interface BoundingBox {
  x: number;      // normalized 0-1 (left)
  y: number;      // normalized 0-1 (top)
  width: number;  // normalized 0-1 (width)
  height: number; // normalized 0-1 (height)
}

export interface RawGeminiBox {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in 0-1000 range or 0-1
  label?: string;
}

export interface Question {
  id: string;
  number: string;          // e.g., "1", "2", "11"
  subpart?: string;        // e.g., "a", "b", "i", "ii" (null if top-level single question)
  fullLabel: string;       // e.g., "1", "11(a)", "11(b)", "Question 4"
  text: string;
  maxMarks?: number;
  pageIndex: number;       // 0-indexed page in the question paper
}

export interface AnswerBlock {
  id: string;
  questionNumberGuess?: string; // e.g. "11(a)", "2", or null if not identified
  text: string;                 // OCR extracted text of answer
  pageIndex: number;            // 0-indexed page in the answer sheet
  bbox: BoundingBox;            // Normalized bounding box (0-1)
  confidence?: number;
}

export type MappingStatus = 'answered' | 'unanswered' | 'out_of_order' | 'unmatched';

export interface EvaluationGrade {
  score: number;
  maxMarks: number;
  feedback: string;
  rubricBreakdown?: {
    criterion: string;
    pointsAwarded: number;
    maxPoints: number;
    comment: string;
  }[];
}

export interface MappedAnswer {
  id: string;
  question: Question;
  answer: AnswerBlock | null;
  status: MappingStatus;
  orderIndex?: number;          // Position in sequence of answers provided
  expectedOrderIndex?: number;  // Position expected based on question paper
  grade?: EvaluationGrade;
}

export interface EvaluationResult {
  questions: Question[];
  answers: AnswerBlock[];
  mappedAnswers: MappedAnswer[];
  summary: {
    totalQuestions: number;
    answeredCount: number;
    unansweredCount: number;
    outOfOrderCount: number;
    unmatchedAnswersCount: number;
    totalScore: number;
    maxTotalMarks: number;
    percentage: number;
  };
  unmatchedAnswers: AnswerBlock[]; // answers found in sheet that do not map to any question
}

export interface PageImage {
  pageIndex: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface ProcessedDocument {
  name: string;
  pages: PageImage[];
  type: 'question_paper' | 'answer_sheet';
}
