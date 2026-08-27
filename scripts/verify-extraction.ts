import fs from 'fs';
import path from 'path';

// --- ANSI Colors for rich console formatting ---
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const MAGENTA = '\x1b[35m';

interface QuestionItem {
  number?: string;
  id?: string;
  text?: string;
  pageIndex?: number;
}

interface BBox {
  ymin?: number;
  xmin?: number;
  ymax?: number;
  xmax?: number;
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
}

interface AnswerItem {
  id?: string;
  questionNumberGuess?: string | null;
  questionNumber?: string | null;
  text?: string;
  pageIndex?: number;
  bbox?: BBox;
  box?: { x?: number; y?: number; width?: number; height?: number };
  box_2d?: [number, number, number, number];
  continuesFromPageIndex?: number | null;
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let questionsPath = path.resolve(process.cwd(), 'test-questions.json');
  let answersPath = path.resolve(process.cwd(), 'test-answers.json');
  let expectedCount: number | null = null;
  let expectedQuestionNumbers: string[] = ['1', '2', '3', '4', '6(a)', '6(b)', '8(i)', '8(ii)'];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--questions' || arg === '-q') {
      questionsPath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--answers' || arg === '-a') {
      answersPath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--count' || arg === '-c') {
      expectedCount = parseInt(args[++i], 10);
    } else if (arg === '--expected' || arg === '-e') {
      const raw = args[++i];
      try {
        if (raw.startsWith('[')) {
          expectedQuestionNumbers = JSON.parse(raw);
        } else {
          expectedQuestionNumbers = raw.split(',').map((s) => s.trim());
        }
      } catch {
        expectedQuestionNumbers = raw.split(',').map((s) => s.trim());
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
${BOLD}Usage:${RESET} npx tsx scripts/verify-extraction.ts [options]

${BOLD}Options:${RESET}
  -q, --questions <file>   Path to questions JSON (default: ./test-questions.json)
  -a, --answers <file>     Path to answers JSON (default: ./test-answers.json)
  -c, --count <num>        Expected total question count (default: length of expected list)
  -e, --expected <list>    Expected question keys e.g. "1,2,3,4,6(a),6(b),8(i),8(ii)" or '["1","2"]'
  -h, --help               Show help
`);
      process.exit(0);
    } else if (!isNaN(parseInt(arg, 10)) && expectedCount === null) {
      // Positional: expected count
      expectedCount = parseInt(arg, 10);
    } else if (arg.includes(',') || arg.startsWith('[')) {
      // Positional: expected list
      try {
        if (arg.startsWith('[')) {
          expectedQuestionNumbers = JSON.parse(arg);
        } else {
          expectedQuestionNumbers = arg.split(',').map((s) => s.trim());
        }
      } catch {
        expectedQuestionNumbers = arg.split(',').map((s) => s.trim());
      }
    }
  }

  if (expectedCount === null) {
    expectedCount = expectedQuestionNumbers.length;
  }

  return { questionsPath, answersPath, expectedCount, expectedQuestionNumbers };
}

function loadJsonFile(filePath: string, name: string): any[] {
  if (!fs.existsSync(filePath)) {
    console.error(`${RED}❌ Error:${RESET} File not found: ${filePath}`);
    console.error(`${GRAY}   Please ensure "${path.basename(filePath)}" exists in the current directory.${RESET}`);
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const list = parsed.questions || parsed.answers || parsed.items || parsed.data || Object.values(parsed).find((v) => Array.isArray(v));
      if (Array.isArray(list)) return list;
    }
    return [parsed];
  } catch (err: any) {
    console.error(`${RED}❌ JSON Parsing Error in ${name} (${filePath}):${RESET} ${err.message}`);
    process.exit(1);
  }
}

function extractBoundingBox(item: AnswerItem): { ymin: number; xmin: number; ymax: number; xmax: number } {
  let ymin = 0, xmin = 0, ymax = 0.2, xmax = 0.8;

  if (item.bbox) {
    const rawYmin = item.bbox.ymin ?? item.bbox.top ?? 0;
    const rawXmin = item.bbox.xmin ?? item.bbox.left ?? 0;
    const rawYmax = item.bbox.ymax ?? item.bbox.bottom ?? (rawYmin + 0.2);
    const rawXmax = item.bbox.xmax ?? item.bbox.right ?? (rawXmin + 0.8);
    ymin = rawYmin > 1 ? rawYmin / 1000 : rawYmin;
    xmin = rawXmin > 1 ? rawXmin / 1000 : rawXmin;
    ymax = rawYmax > 1 ? rawYmax / 1000 : rawYmax;
    xmax = rawXmax > 1 ? rawXmax / 1000 : rawXmax;
  } else if (item.box) {
    xmin = (item.box.x ?? 0) > 1 ? (item.box.x ?? 0) / 1000 : (item.box.x ?? 0);
    ymin = (item.box.y ?? 0) > 1 ? (item.box.y ?? 0) / 1000 : (item.box.y ?? 0);
    const w = (item.box.width ?? 0.8) > 1 ? (item.box.width ?? 0.8) / 1000 : (item.box.width ?? 0.8);
    const h = (item.box.height ?? 0.2) > 1 ? (item.box.height ?? 0.2) / 1000 : (item.box.height ?? 0.2);
    xmax = xmin + w;
    ymax = ymin + h;
  } else if (item.box_2d && Array.isArray(item.box_2d) && item.box_2d.length === 4) {
    ymin = item.box_2d[0] > 1 ? item.box_2d[0] / 1000 : item.box_2d[0];
    xmin = item.box_2d[1] > 1 ? item.box_2d[1] / 1000 : item.box_2d[1];
    ymax = item.box_2d[2] > 1 ? item.box_2d[2] / 1000 : item.box_2d[2];
    xmax = item.box_2d[3] > 1 ? item.box_2d[3] / 1000 : item.box_2d[3];
  }

  return { ymin, xmin, ymax, xmax };
}

function runVerification() {
  const { questionsPath, answersPath, expectedCount, expectedQuestionNumbers } = parseCliArgs();

  console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  📋 VedaAI Extraction & BBox Verification Report${RESET}`);
  console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${GRAY}Questions file:${RESET} ${questionsPath}`);
  console.log(`${GRAY}Answers file:  ${RESET} ${answersPath}`);
  console.log(`${GRAY}Expected count:${RESET} ${expectedCount}`);
  console.log(`${GRAY}Expected keys: ${RESET} [${expectedQuestionNumbers.join(', ')}]\n`);

  const questions: QuestionItem[] = loadJsonFile(questionsPath, 'test-questions.json');
  const answers: AnswerItem[] = loadJsonFile(answersPath, 'test-answers.json');

  let passed = true;

  // --- CHECKLIST ITEM 1: Total questions extracted vs expected count ---
  console.log(`${BOLD}1. Question Count Verification${RESET}`);
  const actualCount = questions.length;
  if (actualCount === expectedCount) {
    console.log(`   ${GREEN}✓ PASS:${RESET} Extracted ${actualCount} question(s) (matches expected ${expectedCount})`);
  } else {
    passed = false;
    console.log(`   ${RED}✗ FAIL:${RESET} Extracted ${actualCount} question(s), expected ${expectedCount}`);
  }
  console.log('');

  // --- CHECKLIST ITEM 2: Question numbers found, duplicates, and formats ---
  console.log(`${BOLD}2. Question Numbering & Formats Check${RESET}`);
  const qNumberCounts: Record<string, number> = {};
  const unexpectedFormatList: string[] = [];

  questions.forEach((q, idx) => {
    const num = String(q.number || `UNKNOWN_IDX_${idx}`).trim();
    qNumberCounts[num] = (qNumberCounts[num] || 0) + 1;

    // Check format (standard digits, subparts like 11(a), 3(b), 8(i), Q1, etc.)
    const isValidFormat = /^[0-9]+(\([a-zA-Z0-9ivxLCDM]+\)|[a-zA-Z0-9.-]+)?$/i.test(num) || /^Q?[0-9]+/i.test(num);
    if (!isValidFormat) {
      unexpectedFormatList.push(num);
    }
  });

  const questionNumbersFound = Object.keys(qNumberCounts);
  console.log(`   ${CYAN}• Found Question Numbers (${questionNumbersFound.length}):${RESET} [${questionNumbersFound.join(', ')}]`);

  // Flag duplicates
  const duplicates = Object.entries(qNumberCounts).filter(([_, count]) => count > 1);
  if (duplicates.length === 0) {
    console.log(`   ${GREEN}✓ No duplicate question identifiers detected.${RESET}`);
  } else {
    passed = false;
    duplicates.forEach(([num, count]) => {
      console.log(`   ${RED}✗ DUPLICATE DETECTED:${RESET} Question "${num}" appears ${count} times!`);
    });
  }

  // Flag unexpected formats
  if (unexpectedFormatList.length > 0) {
    console.log(`   ${YELLOW}⚠ UNEXPECTED FORMATS:${RESET} [${unexpectedFormatList.join(', ')}]`);
  }
  console.log('');

  // --- CHECKLIST ITEM 3 & 5: Answer Blocks & Guessed Question Numbers ---
  console.log(`${BOLD}3. Answer Blocks & Guesses Verification${RESET}`);
  console.log(`   ${CYAN}• Total Answer Blocks Extracted:${RESET} ${answers.length}`);

  const guessesFound: (string | null)[] = [];
  const unmatchedBlocks: { idx: number; pageIndex: number; textSnippet: string }[] = [];
  const matchedBlocks: { idx: number; guess: string; pageIndex: number }[] = [];

  answers.forEach((ans, idx) => {
    const guess = ans.questionNumberGuess ?? ans.questionNumber ?? null;
    const pageIndex = typeof ans.pageIndex === 'number' ? ans.pageIndex : 0;
    guessesFound.push(guess);

    if (guess === null || guess === undefined || String(guess).trim() === '') {
      unmatchedBlocks.push({
        idx: idx + 1,
        pageIndex,
        textSnippet: (ans.text || '').slice(0, 50),
      });
    } else {
      matchedBlocks.push({
        idx: idx + 1,
        guess: String(guess).trim(),
        pageIndex,
      });
    }
  });

  const matchedGuessesList = matchedBlocks.map((m) => `Block #${m.idx} (p.${m.pageIndex + 1}) → Q${m.guess}`);
  if (matchedGuessesList.length > 0) {
    console.log(`   ${GREEN}✓ Matched Guesses (${matchedBlocks.length}):${RESET}`);
    matchedGuessesList.forEach((line) => console.log(`     ↳ ${line}`));
  }

  if (unmatchedBlocks.length > 0) {
    console.log(`   ${YELLOW}⚠ Unmatched Candidates (${unmatchedBlocks.length} with null questionNumberGuess):${RESET}`);
    unmatchedBlocks.forEach((u) => {
      console.log(`     ↳ ${YELLOW}Block #${u.idx} on Page ${u.pageIndex + 1}:${RESET} "${u.textSnippet}${u.textSnippet.length >= 50 ? '...' : ''}"`);
    });
  } else {
    console.log(`   ${GREEN}✓ All answer blocks have a candidate question guess.${RESET}`);
  }
  console.log('');

  // --- CHECKLIST ITEM 4: Bounding Box Geometry Verification ---
  console.log(`${BOLD}4. Spatial Bounding Box Geometry Check${RESET}`);
  let invalidBboxCount = 0;

  answers.forEach((ans, idx) => {
    const { ymin, xmin, ymax, xmax } = extractBoundingBox(ans);
    const issues: string[] = [];

    if (ymin >= ymax) issues.push(`ymin (${ymin.toFixed(3)}) >= ymax (${ymax.toFixed(3)}) [Inverted Y]`);
    if (xmin >= xmax) issues.push(`xmin (${xmin.toFixed(3)}) >= xmax (${xmax.toFixed(3)}) [Inverted X]`);
    if (ymin < 0 || ymin > 1) issues.push(`ymin (${ymin}) out of range [0, 1]`);
    if (ymax < 0 || ymax > 1) issues.push(`ymax (${ymax}) out of range [0, 1]`);
    if (xmin < 0 || xmin > 1) issues.push(`xmin (${xmin}) out of range [0, 1]`);
    if (xmax < 0 || xmax > 1) issues.push(`xmax (${xmax}) out of range [0, 1]`);

    if (issues.length > 0) {
      invalidBboxCount++;
      passed = false;
      console.log(`   ${RED}✗ INVALID BBOX on Answer Block #${idx + 1}:${RESET}`);
      issues.forEach((issue) => console.log(`     ↳ ${RED}${issue}${RESET}`));
    }
  });

  if (invalidBboxCount === 0) {
    console.log(`   ${GREEN}✓ PASS:${RESET} All ${answers.length} answer bounding boxes are normalized and non-inverted (ymin < ymax && xmin < xmax).`);
  }
  console.log('');

  // --- CHECKLIST ITEM 6: Multi-Page Continuation Linking ---
  console.log(`${BOLD}5. Multi-Page Continuation Check${RESET}`);
  const continuations = answers
    .map((ans, idx) => ({ ans, idx: idx + 1 }))
    .filter(({ ans }) => typeof ans.continuesFromPageIndex === 'number' && ans.continuesFromPageIndex !== null);

  if (continuations.length > 0) {
    console.log(`   ${MAGENTA}🔗 Cross-Page Continuations Detected (${continuations.length}):${RESET}`);
    continuations.forEach(({ ans, idx }) => {
      const targetPage = (ans.pageIndex ?? 0) + 1;
      const srcPage = (ans.continuesFromPageIndex ?? 0) + 1;
      console.log(`     ↳ Block #${idx} on Page ${targetPage} continues from Page ${srcPage} (Q Guess: ${ans.questionNumberGuess || 'null'})`);
    });
  } else {
    console.log(`   ${GRAY}• No cross-page continuations tagged in this set.${RESET}`);
  }
  console.log('');

  // --- CHECKLIST ITEM 7: Expected Question Numbers Coverage ---
  console.log(`${BOLD}6. Expected Question Numbers Coverage Summary${RESET}`);
  const extractedSet = new Set(questionNumbersFound.map((k) => k.toLowerCase()));
  const missingFromExtraction: string[] = [];
  const extraInExtraction: string[] = [];

  expectedQuestionNumbers.forEach((expectedKey) => {
    if (!extractedSet.has(expectedKey.toLowerCase())) {
      missingFromExtraction.push(expectedKey);
    }
  });

  questionNumbersFound.forEach((extractedKey) => {
    const matchesExpected = expectedQuestionNumbers.some((exp) => exp.toLowerCase() === extractedKey.toLowerCase());
    if (!matchesExpected) {
      extraInExtraction.push(extractedKey);
    }
  });

  if (missingFromExtraction.length === 0) {
    console.log(`   ${GREEN}✓ PASS:${RESET} All ${expectedQuestionNumbers.length} expected questions extracted: [${expectedQuestionNumbers.join(', ')}]`);
  } else {
    passed = false;
    console.log(`   ${RED}✗ MISSING FROM EXTRACTION (${missingFromExtraction.length}):${RESET} [${missingFromExtraction.join(', ')}]`);
  }

  if (extraInExtraction.length > 0) {
    console.log(`   ${YELLOW}ℹ Extra / Unlisted in Expected list (${extraInExtraction.length}):${RESET} [${extraInExtraction.join(', ')}]`);
  }
  console.log('');

  // --- FINAL REPORT SUMMARY ---
  console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════════════════${RESET}`);
  if (passed) {
    console.log(`${BOLD}${GREEN}  🎉 FINAL RESULT: ALL CHECKS PASSED${RESET}`);
  } else {
    console.log(`${BOLD}${RED}  ❌ FINAL RESULT: CHECKS FAILED (See items flagged with ✗ above)${RESET}`);
  }
  console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════════════════${RESET}\n`);

  process.exit(passed ? 0 : 1);
}

runVerification();
