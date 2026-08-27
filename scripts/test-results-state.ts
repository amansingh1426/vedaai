import fs from 'fs';
import path from 'path';

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

function extractNormalizedBbox(item: any) {
  if (!item) return { ymin: 0, xmin: 0, ymax: 0.2, xmax: 0.8 };
  let ymin = item.bbox?.ymin ?? 0;
  let xmin = item.bbox?.xmin ?? 0;
  let ymax = item.bbox?.ymax ?? 0.2;
  let xmax = item.bbox?.xmax ?? 0.8;
  return { ymin, xmin, ymax, xmax };
}

// Load test data fixtures
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-questions.json'), 'utf8'));
const answers = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-answers.json'), 'utf8'));

// Rendered image dimensions (standard rendered A4 dimensions: 850px width x 1202px height)
const RENDERED_IMAGE_WIDTH = 850;
const RENDERED_IMAGE_HEIGHT = 1202;

// Generate mappings as map-answers produces
const mappings = questions.map((q: any) => {
  const qNorm = normalizeQNum(q.number);
  const matchedAns = answers.find((a: any) => normalizeQNum(a.questionNumberGuess) === qNorm) || null;
  return {
    id: `map_${q.number}`,
    questionNumber: q.number,
    question: q,
    answerBlockId: matchedAns ? matchedAns.id : null,
    answer: matchedAns,
    status: matchedAns ? 'answered' : 'unanswered',
  };
});

const unmatchedAnswers = answers.filter((a: any) => !mappings.some((m: any) => m.answerBlockId === a.id));

function computeOverlayStyle(norm: { ymin: number; xmin: number; ymax: number; xmax: number }, imgW: number, imgH: number) {
  const topPct = `${norm.ymin * 100}%`;
  const leftPct = `${norm.xmin * 100}%`;
  const widthPct = `${Math.max(4, (norm.xmax - norm.xmin) * 100)}%`;
  const heightPct = `${Math.max(2.5, (norm.ymax - norm.ymin) * 100)}%`;

  const topPx = Math.round(norm.ymin * imgH);
  const leftPx = Math.round(norm.xmin * imgW);
  const widthPx = Math.round(Math.max(0.04 * imgW, (norm.xmax - norm.xmin) * imgW));
  const heightPx = Math.round(Math.max(0.025 * imgH, (norm.ymax - norm.ymin) * imgH));

  return {
    percentage: { top: topPct, left: leftPct, width: widthPct, height: heightPct },
    pixel: { top: `${topPx}px`, left: `${leftPx}px`, width: `${widthPx}px`, height: `${heightPx}px` },
    rawPx: { topPx, leftPx, widthPx, heightPx }
  };
}

console.log(`\n======================================================`);
console.log(`TEST 1: CLICK QUESTION 1 ("${mappings[0].questionNumber}")`);
console.log(`======================================================`);
const clickedQ1 = mappings[0];
console.log('[ResultsScreen CLICK Question]', {
  id: clickedQ1.id,
  questionNumber: clickedQ1.questionNumber,
  status: clickedQ1.status,
  answerBlockId: clickedQ1.answerBlockId,
  answerBbox: clickedQ1.answer?.bbox,
});

const activeMapping1 = mappings.find((m: any) => normalizeQNum(m.questionNumber) === normalizeQNum(clickedQ1.questionNumber));
const activeAnswer1 = activeMapping1?.answer;
const norm1 = extractNormalizedBbox(activeAnswer1);
const style1 = computeOverlayStyle(norm1, RENDERED_IMAGE_WIDTH, RENDERED_IMAGE_HEIGHT);

console.log('[ResultsScreen OVERLAY_COMPUTE] For Q1:');
console.log('  Normalized bbox:', norm1);
console.log('  Rendered Image Size:', `${RENDERED_IMAGE_WIDTH}px x ${RENDERED_IMAGE_HEIGHT}px`);
console.log('  Inline CSS Percentage Style:', style1.percentage);
console.log('  Converted Pixel Positioning:', style1.pixel);

console.log(`\n======================================================`);
console.log(`TEST 2: CLICK QUESTION 2 ("${mappings[1].questionNumber}")`);
console.log(`======================================================`);
const clickedQ2 = mappings[1];
console.log('[ResultsScreen CLICK Question]', {
  id: clickedQ2.id,
  questionNumber: clickedQ2.questionNumber,
  status: clickedQ2.status,
  answerBlockId: clickedQ2.answerBlockId,
  answerBbox: clickedQ2.answer?.bbox,
});

const activeMapping2 = mappings.find((m: any) => normalizeQNum(m.questionNumber) === normalizeQNum(clickedQ2.questionNumber));
const activeAnswer2 = activeMapping2?.answer;
const norm2 = extractNormalizedBbox(activeAnswer2);
const style2 = computeOverlayStyle(norm2, RENDERED_IMAGE_WIDTH, RENDERED_IMAGE_HEIGHT);

console.log('[ResultsScreen OVERLAY_COMPUTE] For Q2:');
console.log('  Normalized bbox:', norm2);
console.log('  Rendered Image Size:', `${RENDERED_IMAGE_WIDTH}px x ${RENDERED_IMAGE_HEIGHT}px`);
console.log('  Inline CSS Percentage Style:', style2.percentage);
console.log('  Converted Pixel Positioning:', style2.pixel);

console.log(`\n======================================================`);
console.log(`TEST 3: CLICK UNMATCHED BLOCK ("${unmatchedAnswers[0]?.id}")`);
console.log(`======================================================`);
const clickedUnmatched = unmatchedAnswers[0];
console.log('[ResultsScreen CLICK Unmatched]', {
  id: clickedUnmatched.id,
  bbox: clickedUnmatched.bbox,
  pageIndex: clickedUnmatched.pageIndex,
});

const activeUnmatched3 = unmatchedAnswers.find((u: any) => u.id === clickedUnmatched.id);
const norm3 = extractNormalizedBbox(activeUnmatched3);
const style3 = computeOverlayStyle(norm3, RENDERED_IMAGE_WIDTH, RENDERED_IMAGE_HEIGHT);

console.log('[ResultsScreen OVERLAY_COMPUTE] For Unmatched Block:');
console.log('  Normalized bbox:', norm3);
console.log('  Rendered Image Size:', `${RENDERED_IMAGE_WIDTH}px x ${RENDERED_IMAGE_HEIGHT}px`);
console.log('  Inline CSS Percentage Style:', style3.percentage);
console.log('  Converted Pixel Positioning:', style3.pixel);
