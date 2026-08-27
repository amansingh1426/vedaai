# VedaAI Exam Evaluator

**VedaAI** is an intelligent, spatial document evaluation platform that automates the correlation between academic Question Papers and handwritten Student Answer Sheets. It extracts question structures, transcribes student handwriting, detects precise spatial bounding boxes, maps answers to questions (handling out-of-order, unanswered, and unmatched responses), and provides an interactive grading interface with click-to-highlight spatial overlays.

- **🌐 Live Deployed Application**: [https://vedaai-app-ten.vercel.app/](https://vedaai-app-ten.vercel.app/)
- **💻 GitHub Repository**: [https://github.com/amansingh1426/Vedaai](https://github.com/amansingh1426/Vedaai)

---

## 📸 Workflow & UI Overview

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   VEDAAI PIPELINE                                      │
├──────────────────┬──────────────────┬──────────────────────┬───────────────────────────┤
│ 1. Upload & Prep │ 2. Extraction    │ 3. Spatial Mapping   │ 4. Interactive Evaluation │
│                  │                  │                      │                           │
│  [Question PDF]  │  • Questions &   │  • Deterministic     │  • Question Hierarchy     │
│  [Answer PDF]    │    Sub-parts     │    Pre-match         │  • Click-to-Highlight    │
│        │         │  • Handwritten   │  • AI Semantic       │  • Auto-Scroll Canvas     │
│        ▼         │    OCR & Bboxes  │    Resolution        │  • Flag Out-of-Order /    │
│ [Client Raster]  │  • Continuations │  • Orphan Detection  │    Unanswered / Unmatched │
└──────────────────┴──────────────────┴──────────────────────┴───────────────────────────┘
```

---

## 🚀 Brief Approach

The end-to-end evaluation pipeline operates in four coordinated phases:

### 1. Client-Side Page Rasterization
- When a user uploads a Question Paper or Answer Sheet (PDF or images), the document is converted into high-resolution Page Images directly in the browser using `pdfjs-dist` and HTML5 Canvas.
- Processing occurs client-side, eliminating the need to send heavy PDF files or execute Node canvas binaries on the server.

### 2. Question Extraction (Stage 1)
- The rasterized Question Paper pages are processed by Gemini Flash with strict JSON schema enforcement (`responseSchema`).
- The model extracts every question in its printed order, identifies mark allocations, and splits sub-questions (e.g., `6(a)`, `6(b)`, `1(i)`, `1(ii)`) into distinct, evaluated items.

### 3. Handwritten Answer OCR & Spatial Bounding Boxes (Stage 2)
- The Student Answer Sheet is scanned to detect distinct handwritten answer blocks across all pages.
- For each answer block, the model transcribes the handwritten text, guesses the targeted question number, calculates normalized spatial bounding boxes `[ymin, xmin, ymax, xmax]`, and links multi-page answer continuations (`continuesFromPageIndex`).
- Doodles, margin notes, and rough scratchwork are filtered out from legitimate answer blocks.

### 4. Deterministic + AI-Assisted Mapping (Stage 3)
- **Phase 1 (Deterministic)**: High-confidence exact matches between question numbers and answer guesses are resolved first.
- **Phase 2 (AI Semantic Resolution)**: Any remaining unnumbered, mislabeled, or out-of-order answer blocks are correlated against unresolved questions using semantic context and text embeddings.
- Unanswered questions are flagged with a prominent warning badge, and extra student writing that does not correspond to any question is categorized as **Unmatched**.

### 5. Interactive Results & Spatial Highlighting
- Evaluators are presented with a synchronized split-view interface:
  - **Left Panel**: Hierarchical Question list displaying marks, status (Answered, Unanswered, Out-of-Order), and transcription previews.
  - **Right Panel**: Multi-page Answer Sheet canvas.
- Clicking any question automatically smooth-scrolls the canvas to the corresponding page and pulses an animated SVG bounding box around the exact handwritten response.

---

## 🤖 AI Model & API Used

- **Primary Model**: **Gemini 2.0 Flash** (`gemini-2.0-flash` / `gemini-2.5-flash`) via the Google GenAI SDK (`@google/genai`)
- **Why Gemini 2.0 Flash?**:
  1. **Native Multimodal OCR & Spatial Grounding**: Gemini 2.0 Flash provides native vision grounding, returning normalized bounding box coordinates (`[ymin, xmin, ymax, xmax]`) directly alongside text transcriptions in a single inference pass.
  2. **Structured JSON Output (`responseSchema`)**: Guarantees that complex nested question trees, sub-parts, and coordinate arrays strictly match TypeScript data structures.
  3. **Low Latency & High Throughput**: Fast inference speeds (~1–3 seconds per multi-page document) ideal for interactive evaluation workflows.
  4. **Cost Efficiency**: Generous free-tier limits (15 RPM) suitable for academic deployment and demonstration.

---

## 📐 Assumptions & Limitations

1. **Single Student Answer Sheet**: Per specification, the system is designed to evaluate one student's answer sheet submission against one question paper at a time.
2. **Handwriting Legibility**: Highly illegible handwriting, severe overwriting, or faint pencil strokes may reduce OCR transcription accuracy and question number guessing confidence.
3. **Bounding Box Grounding Precision**: Bounding box precision reflects Gemini's spatial grounding capabilities. For extremely dense, cramped, or diagonal handwriting, bounding boxes may be approximate or slightly encompass adjacent margin notes.
4. **In-Memory Session State**: Document rasterization and intermediate extractions are stored in browser memory for security and fast UI transitions. Hard-refreshing the page resets the active evaluation session.
5. **Document Pair Correspondence (Sanity Check)**: The application assumes that the uploaded Question Paper and Answer Sheet belong to the same exam. If the mismatch rate exceeds 70%, the system displays a **Sanity Check Warning Banner** advising the evaluator to verify the uploaded files.
6. **Untested Numbering Formats**: While common numbering formats (e.g., `1`, `2.a`, `3(i)`, `Q4(b)`) are supported and split, highly non-standard formats (e.g., custom Roman numeral hierarchies, unnumbered bullet-only tests, or multi-column grids) may require manual reviewer inspection.
7. **Duplicate Answer Block Tie-Breaking**:
   - If a student writes two separate answer blocks referencing the same question number (e.g., two answers labeled "Q6"), the **first chronological occurrence in reading order** (earliest page / uppermost coordinate) is deterministically assigned to the primary question slot.
   - Any subsequent duplicate block is preserved and passed to the semantic mapping stage to determine whether it is a continuation, an alternate attempt, or an unmatched section.

---

## 📦 Getting Started Locally

### 1. Clone the repository
```bash
git clone https://github.com/amansingh1426/Vedaai.git
cd Vedaai
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env.local` file from `.env.example`:
```bash
cp .env.example .env.local
```
Add your Google Gemini API Key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Run the development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for production
```bash
npm run build
npm run start
```
