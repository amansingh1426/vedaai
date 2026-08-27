# VedaAI Hiring Assignment — Execution Roadmap

A complete, phase-by-phase build plan with ready-to-use prompts (for Claude Code / Cursor / any AI pair-programmer), edge cases, and test checkpoints. Follow phases in order — don't skip the "Verify" step at the end of each phase.

---

## 1. What's Actually Being Evaluated (read this first)

The brief looks like a CRUD upload app, but the scoring criteria tell the real story:

| Evaluation criteria | What it actually means for your build |
|---|---|
| Accuracy of question extraction | Numbering logic (11(a)/11(b) as separate entries) must be bulletproof |
| Accuracy of answer mapping | You need a real matching algorithm, not just "same order" |
| Correct highlighting of answers | You need **coordinates**, not just cropped text — this is the hardest part |
| Handling of edge cases | Unanswered / out-of-order / unmatched answers must be explicitly handled in UI, not silently dropped |
| Quality of implementation | Clean code, error states, loading states, responsive |
| Overall product experience | Must visually match the Figma reference |

**The #1 technical risk** is highlighting the *exact region* on the answer sheet. Plan for this from day one — don't bolt it on at the end.

---

## 2. Recommended Tech Stack

- **Framework:** Next.js 14 (App Router) + TypeScript + Tailwind CSS — matches the "recommended" stack and gives you API routes for free (no separate backend needed).
- **File handling:** `react-dropzone` for upload UI, `pdfjs-dist` to render PDF pages as images (you need images anyway, since vision models take images).
- **AI Model:** **Google Gemini 2.0 Flash (or 2.5 Flash)** via the free-tier API.
  - Why: strong handwriting OCR, native multi-image input, and — critically — **native bounding-box/spatial understanding**, which you can exploit for the highlighting requirement (ask it to return normalized `[ymin, xmin, ymax, xmax]` boxes for a given block of text on the page).
  - Alternative: OpenAI `gpt-4o-mini` (also has decent vision + a usable free/cheap tier) if Gemini rate limits are an issue — but Gemini's spatial grounding is the more reliable pick here.
- **State/storage:** In-memory only (per requirement) — hold parsed data in React state on the client after the API call returns; no DB.
- **Deployment:** Vercel (free tier, trivial Next.js deploy, gives you the live URL requirement instantly).
- **Repo:** GitHub, public, with the README described in Phase 12.

---

## 3. Architecture Overview

```
[Upload UI] 
   → user uploads Question Paper (PDF/img) + Answer Sheet (PDF/img)
   → client converts PDF pages → PNG images (pdfjs-dist, in-browser)
   → POST images to /api/extract-questions and /api/extract-answers
        → Gemini Vision call #1: extract questions (ordered, sub-parts split)
        → Gemini Vision call #2: extract answers WITH bounding boxes + page index
   → POST both structured outputs to /api/map-answers
        → Gemini text call: map answers→questions, flag unanswered/unmatched/out-of-order
   → (optional) POST to /api/grade
        → Gemini text call: score + feedback per question
   → Client renders: 
        Left = question list (clickable)
        Right = answer sheet image(s) with an SVG/CSS overlay box
        Click question → scroll to correct page → draw highlight from stored bbox
```

Keep every AI call **stateless and independent** (question extraction doesn't need to know about answers, etc.) — this makes debugging and re-running a single stage much easier when something goes wrong.

---

## 4. Phase-by-Phase Roadmap

### Phase 0 — Project Setup & Figma Teardown

**Goal:** Scaffold the repo and extract exact design tokens from Figma before writing any UI.

**Prompt:**
```
Create a new Next.js 14 project with TypeScript, App Router, and Tailwind CSS.
Set up the folder structure:
- app/ (pages)
- app/api/ (route handlers)
- components/
- lib/ (ai client, types, utils)
- types/ (shared TypeScript interfaces)

Also create a lib/types.ts file with these interfaces (I'll refine later):
- Question { id, number, subpart, text, pageIndex }
- AnswerBlock { id, questionNumberGuess, text, pageIndex, bbox: {x, y, width, height} (normalized 0-1) }
- MappedAnswer { question: Question, answer: AnswerBlock | null, status: 'answered' | 'unanswered' | 'out_of_order' | 'unmatched' }
```

**Manually do:** Open the Figma file, zoom into each screen, and note down: color palette, font, spacing, the exact copy on buttons ("Upload Question Paper", "Upload Answer Sheet", "Start Mapping"), and the layout of the final side-by-side + highlight screen (from your screenshot, it's a 3-column-ish view: questions | answer sheet page | zoomed/marked-up answer sheet).

**Verify:** `npm run dev` boots cleanly, Tailwind classes render.

---

### Phase 1 — Upload UI (matches Figma screen 1 & 2)

**Prompt:**
```
Build the upload screen matching this design: a left panel showing a teacher avatar/profile placeholder and school name, a right panel with two upload cards side by side — "Upload Question Paper" and "Upload Answer Sheet". Each card accepts PDF, PNG, JPG, drag-and-drop or click-to-browse, shows the selected filename once chosen, and has a subtle file-size/type validation message. Add a primary "Start Mapping" button at the bottom, disabled until both files are selected. Use react-dropzone. Style with Tailwind to match a clean, card-based teacher-tool aesthetic (rounded corners, soft shadows, one accent color).
```

**Edge cases to explicitly handle here:**
- Wrong file type selected → inline error, don't crash
- File too large (set a sane limit, e.g. 20MB) → inline error
- User uploads the same file to both slots → warn but allow (don't block)
- Multi-page PDF vs single image → both must be accepted

**Verify:** Try uploading: a PDF, a PNG, a .docx (should reject), a 0-byte file, two files at once via drag.

---

### Phase 2 — PDF → Image Conversion + Processing Progress Screen

**Prompt:**
```
Add a utility in lib/pdf-to-images.ts that uses pdfjs-dist to convert an uploaded PDF File into an array of base64 PNG images (one per page), at a resolution good enough for OCR (scale ~2). If the uploaded file is already an image, just base64-encode it directly and return a single-element array.

Then build a "Processing" screen matching the Figma design: a card with the school/user badge, a large "Extracting..." label, a subtle animated spinner, and "This may take a while" caption. Wire it so clicking "Start Mapping" navigates to this screen, converts both files to images client-side, then calls the extraction APIs (stubbed for now — return dummy data), and shows real progress state (e.g., "Converting files...", "Extracting questions...", "Extracting answers...", "Mapping answers...").
```

**Verify:** Upload a 3-page PDF, confirm you get 3 base64 images in the console with correct page order.

---

### Phase 3 — Question Extraction API

**Prompt:**
```
Create app/api/extract-questions/route.ts. It accepts an array of base64 page images (the question paper) and calls Gemini 2.0 Flash with all pages in one request. 

Use this system instruction: "You are analyzing a printed exam question paper. Extract every question in the exact order they appear on the page, preserving original numbering exactly as printed. If a question has labelled sub-parts (like (a), (b), (i), (ii)), treat each sub-part as a SEPARATE question entry, combining the parent number with the subpart label (e.g., '11(a)', '11(b)'). Do not renumber or reorder anything. Return strict JSON only, matching this schema: [{ "number": string, "text": string, "pageIndex": number }]. If a question spans multiple lines or wraps to the next page, keep it as one entry with the pageIndex of where it starts."

Parse the JSON response defensively (strip markdown code fences if present, handle malformed JSON with a retry-once strategy). Return the structured question list.
```

**Edge cases:**
- Question paper has instructions/header text at the top → must not be extracted as a "question"
- Multi-part questions with roman numerals vs letters vs numbers — instruction must be generic enough to catch all
- A question that's actually a table or diagram-based question → text should note "[diagram]" rather than fail
- OCR misreads and model returns broken JSON → retry logic needed

**Verify:** Test with a real scanned/printed question paper containing at least one multi-part question (e.g. Q5(a)/(b)) and confirm both come back as distinct entries with correct page numbers.

---

### Phase 4 — Answer Extraction API (with bounding boxes)

**Prompt:**
```
Create app/api/extract-answers/route.ts. It accepts base64 page images of the handwritten answer sheet and calls Gemini 2.0 Flash.

System instruction: "You are analyzing a handwritten student answer sheet. Identify each distinct answer block written on the page — a student may write answers out of order, skip questions, or write extra content that doesn't correspond to any question. For each block: 1) transcribe the handwritten text as accurately as possible, 2) guess which question number it's answering based on any number the student wrote next to it (may be missing or wrong), 3) return a bounding box in normalized coordinates [0,1] for exactly where that block of handwriting sits on the page (ymin, xmin, ymax, xmax), 4) note the page index. If an answer clearly continues from a previous page, mark it with a continuesFromPageIndex field. Return strict JSON only: [{ "questionNumberGuess": string|null, "text": string, "pageIndex": number, "bbox": {"ymin":0-1,"xmin":0-1,"ymax":0-1,"xmax":0-1}, "continuesFromPageIndex": number|null }]"

Add the same defensive JSON parsing/retry as Phase 3.
```

**Edge cases:**
- Student writes no question number at all → `questionNumberGuess: null`, mapping phase must still try
- Answer spans two pages → `continuesFromPageIndex` handles this
- Random doodles/scratched-out text → model may hallucinate a block; filter blocks with near-empty text
- Bounding box comes back inverted or out of [0,1] range → clamp defensively in code, never trust raw model output blindly

**Verify:** This is the highest-risk phase. Take one real answer-sheet image, run it, then **draw the returned bbox as a red rectangle on the image in a quick test script** to confirm the coordinates actually line up with the handwriting. If they're off, tighten the prompt (e.g., explicitly define which corner is (0,0)) before moving on — don't proceed with broken coordinates.

---

### Phase 5 — Answer Mapping Engine

**Prompt:**
```
Create app/api/map-answers/route.ts. It accepts the question list (Phase 3 output) and answer block list (Phase 4 output), and calls Gemini (text-only, no images needed here) to produce the final mapping.

System instruction: "You will receive a list of exam questions (with exact numbers) and a list of handwritten answer blocks (each with a guessed question number, which may be null, wrong, or out of order). Your job: for each question, find the best-matching answer block using the guessed number AND the semantic content of the answer relative to the question text. Rules: 1) A question with no plausible matching answer block is 'unanswered'. 2) An answer block that doesn't correspond to any real question is 'unmatched' and should be listed separately. 3) If an answer's guessed number doesn't match its position in the answer sheet order, still map it correctly and mark status 'out_of_order'. 4) Never fabricate an answer's content — only reference provided answer block IDs. Return strict JSON: { "mappings": [{ "questionNumber": string, "answerBlockId": string|null, "status": "answered"|"unanswered"|"out_of_order" }], "unmatchedAnswers": [answerBlockId, ...] }"

Also write a lightweight deterministic fallback matcher (pure code, no AI call) that runs BEFORE the AI call: if an answer's questionNumberGuess exactly string-matches a question number, pre-mark it as a high-confidence match. Only send the ambiguous/unmatched remainder to the AI mapping call, to save tokens and improve accuracy. Merge both results into the final mapping list.
```

**Edge cases:**
- Two answer blocks both claim the same question number → keep the first occurrence, mark the second as `unmatched` (or let the AI decide semantically — pick one strategy and document it in the README)
- Answer sheet has more distinct blocks than questions → surplus block(s) go to `unmatchedAnswers`
- Question paper has a question the student clearly attempted but numbered wrong (e.g., wrote "Q4" but it's actually answering Q5) → this is why the semantic AI pass matters, not just number-matching

**Verify:** Manually construct 3 test fixtures (JSON files, no need to re-run OCR each time): (1) perfect 1:1 match, (2) one unanswered + one out-of-order, (3) one unmatched extra answer. Run the mapping API against each and confirm the output status flags are correct.

---

### Phase 6 — Side-by-Side Review UI + Highlighting (matches your Figma screenshot)

**Prompt:**
```
Build the results screen matching the reference design: left column = scrollable list of questions (numbered, with a small status badge: answered / unanswered / out of order), middle/right = the answer sheet page image rendered at full size with an absolutely-positioned highlight overlay div.

Behavior: clicking a question in the left list should:
1. Scroll the answer sheet view to the correct page (if the answer is on a different page than currently shown)
2. Render a highlighted rectangle overlay using the stored bbox (convert normalized 0-1 coords to pixel coords based on the rendered image's actual displayed width/height, recalculating on window resize)
3. If the question is unanswered, show a clear "No answer found for this question" state instead of a highlight
4. If clicking one of the "unmatched answers" (list them at the bottom of the left column, visually distinct), highlight that region too and label it "Unmatched — no corresponding question found"

Use a simple colored border + semi-transparent fill for the highlight (e.g., border-2 border-yellow-400 bg-yellow-400/20), with a smooth CSS transition when it moves between questions.
```

**Edge cases:**
- Answer spans two pages → clicking the question should show a way to view both pages (e.g., a small "continued on page X" chip that jumps there)
- Image hasn't loaded yet when bbox tries to render → guard with `onLoad` before computing pixel coordinates
- Very small bbox (single word) → set a minimum highlight size so it's still visible/clickable

**Verify:** Click through every question in a real test document; confirm every highlight visually lands on the correct handwriting, on the correct page, including at least one multi-page answer and one unanswered question.

---

### Phase 7 — Grading & AI Feedback (optional scope, adds polish/differentiation)

**Prompt:**
```
Create app/api/grade/route.ts. Accepts the mapped question+answer pairs and calls Gemini to produce, per question: a score (e.g., out of a default 5, or "N/A" if unanswered), a one-line correctness verdict, and 1-2 sentences of constructive feedback. Also produce one overall summary: total score, percentage, and 2-3 sentence overall feedback on the student's performance.

Add a "Grading Summary" panel/tab in the UI matching the app's visual style, showing per-question scores and the overall summary, with unanswered questions clearly shown as 0/skipped rather than silently omitted.
```

**Edge cases:**
- Unanswered questions must still appear in the grading summary (as 0, not excluded) — this is explicitly a "handle unanswered questions" requirement
- Handwriting the model couldn't confidently transcribe → feedback should say so rather than confidently grading garbled text

**Verify:** Confirm total score sums correctly including zeros for unanswered questions.

---

### Phase 8 — Global Error & Loading States

**Prompt:**
```
Audit every API route and add: try/catch with a typed error response, a timeout wrapper (Gemini calls should fail gracefully after ~30s with a "try again" UI state, not hang forever), and a retry button in the UI for each stage (question extraction, answer extraction, mapping, grading) that re-runs just that stage without re-uploading files. Add a global toast/banner for API key errors or rate-limit errors from the free-tier API, since that's the most likely real-world failure mode during a demo.
```

**Verify:** Deliberately break your API key temporarily and confirm the UI shows a clean error, not a blank screen or unhandled console error.

---

### Phase 9 — Full Edge Case Pass

Go through the master checklist in Section 5 below and check off each one against your actual running app — not in theory.

---

### Phase 10 — Testing Pass

Use the test matrix in Section 6. For each row, actually run it through your deployed (or local) app and record pass/fail.

---

### Phase 11 — Deployment

**Prompt:**
```
Prepare this Next.js app for Vercel deployment: move the Gemini API key to an environment variable (GEMINI_API_KEY), ensure it's only referenced in server-side route handlers (never exposed to the client bundle), add a .env.example file, and confirm next.config handles the pdfjs-dist worker correctly in a serverless/edge environment (may need to set it up as a client-only import with dynamic import + ssr:false).
```

Then:
1. Push to a public GitHub repo.
2. Import into Vercel, add `GEMINI_API_KEY` in the Vercel dashboard env vars.
3. Deploy, get the live URL.
4. Test the **live URL**, not just localhost — serverless timeouts and cold starts can break things that worked locally (Gemini calls + large image payloads can be slow; consider increasing the Vercel function timeout in `vercel.json` if you're on a plan that allows it).

---

### Phase 12 — Documentation & Submission Package

**Prompt:**
```
Write a README.md for this repo including: 1) Live deployed URL, 2) GitHub repo link, 3) a "Brief Approach" section explaining the extraction → mapping → highlighting → grading pipeline in plain language, 4) "AI Model/API Used" naming Gemini 2.0 Flash and why, 5) an "Assumptions & Limitations" section covering: single student answer sheet only (per spec), handwriting legibility affects OCR accuracy, bounding box precision depends on Gemini's spatial grounding and may be approximate for very small/cramped handwriting, in-memory storage means refreshing the page loses state, and any question numbering formats not explicitly tested. Include screenshots or a short GIF of the working flow if possible.
```

**Final submission checklist:**
- [ ] Live deployed URL works (test in incognito, no auth prompts)
- [ ] GitHub repo is public and README is complete
- [ ] Question paper upload works for both PDF and image
- [ ] Answer sheet upload works for both PDF and image
- [ ] Multi-part questions (e.g. 11(a)/11(b)) show as separate entries
- [ ] Original numbering preserved exactly
- [ ] Out-of-order answers map correctly
- [ ] Unanswered questions are visibly flagged, not hidden
- [ ] Unmatched/extra answers are visibly flagged, not dropped
- [ ] Highlighting is pixel-accurate on at least 3 different test documents
- [ ] Multi-page answers work (highlight + page navigation)
- [ ] Grading/feedback section (if included) accounts for unanswered = 0
- [ ] No console errors on a full run-through
- [ ] UI visually matches the Figma reference

---

## 5. Master Edge Case Checklist

**Upload stage**
- [ ] Non-PDF/image file rejected with clear message
- [ ] Oversized file rejected
- [ ] Corrupt/unreadable PDF handled without crash
- [ ] Single-page vs multi-page PDF both work

**Question extraction**
- [ ] Header/instruction text not mistaken for a question
- [ ] Sub-parts (a)/(b)/(i)/(ii) split into separate entries
- [ ] Question numbering preserved exactly as printed (not renumbered 1,2,3...)
- [ ] Question spanning a page break stays as one entry
- [ ] Non-text elements (diagrams/tables) in a question don't break extraction

**Answer extraction**
- [ ] Answers written out of numerical order still get extracted individually
- [ ] Answer with no number written is still captured (`questionNumberGuess: null`)
- [ ] Bounding box coordinates map correctly onto the rendered image
- [ ] Answer spanning two pages linked via `continuesFromPageIndex`
- [ ] Doodles/crossed-out scribbles don't get treated as real answer blocks

**Mapping**
- [ ] Question with zero matching answer → `unanswered`
- [ ] Answer with zero matching question → `unmatched`, shown separately
- [ ] Two answers claiming the same question number → deterministic tie-break, documented
- [ ] Semantically-correct-but-mislabeled answer still mapped right (not just string number match)

**UI**
- [ ] Highlight recalculates correctly on window resize
- [ ] Clicking a question on a different page auto-scrolls/switches page
- [ ] Loading and error states present at every async step
- [ ] Works at both desktop and reasonably narrow viewport widths

---

## 6. Test Case Matrix (run these against the live deployed app)

| # | Test input | Expected result |
|---|---|---|
| 1 | Clean question paper, clean answer sheet, all answered in order | All questions mapped 1:1, no unanswered/unmatched |
| 2 | Question paper with 11(a) and 11(b) | Two separate question entries, correct sub-labels |
| 3 | Answer sheet with Q3 answered before Q2 | Both map correctly despite physical order |
| 4 | Answer sheet missing an answer to one question | That question flagged `unanswered`, not silently skipped |
| 5 | Answer sheet with an extra answer to a non-existent question | Flagged as `unmatched`, shown in UI |
| 6 | Answer spanning 2 pages | Correctly linked, both regions highlightable |
| 7 | Upload PDF question paper + image answer sheet (mixed types) | Both handled without error |
| 8 | Very messy/hard-to-read handwriting | Doesn't crash; low-confidence text still shown, ideally flagged |
| 9 | Click every question in sequence | Highlight box lands accurately every time, no lag/misalignment |
| 10 | Refresh the page mid-review | Since it's in-memory only, state resets — confirm this is graceful (redirects to upload), not a broken UI |
| 11 | Simulate API failure (bad key / rate limit) | Clean error message + retry option, no blank/crashed screen |
| 12 | Grading tab (if implemented) with 1 unanswered question | Total score correctly reflects 0 for that question |

---

## 7. Suggested Order of Work (time-boxed if you're on a deadline)

1. Phases 0–2 (setup + upload + progress UI) — get something visually matching Figma fast, this is the easiest win.
2. Phase 3 (question extraction) — verify against a real document before moving on.
3. Phase 4 (answer extraction + bbox) — **spend the most time here**, verify bboxes visually before proceeding.
4. Phase 5 (mapping) — test with fixture JSON, not live OCR, to iterate fast.
5. Phase 6 (highlighting UI) — wire it all together.
6. Phase 8 (error states) — do this before Phase 7, it's higher priority for "quality of implementation."
7. Phase 7 (grading) — only after core pipeline is rock solid, since it's explicitly optional scope.
8. Phases 9–12 (edge cases, testing, deploy, docs) — don't skip these; "handling of edge cases" is a named evaluation criterion.
