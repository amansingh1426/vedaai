# VedaAI Exam Evaluator

**VedaAI** is an AI-powered spatial document correlation engine that parses academic Question Papers and handwritten Student Answer Sheets, extracts question structures and handwritten responses, maps them together (handling out-of-order, unanswered, and unmatched edge cases), and renders an interactive spatial evaluation interface with bounding box overlays.

- **🌐 Live Deployed Application**: [https://vedaai-evaluator.vercel.app](https://vedaai-evaluator.vercel.app)
- **💻 GitHub Repository**: [https://github.com/amansingh1426/Vedaai](https://github.com/amansingh1426/Vedaai)

---

## 🚀 Brief Approach

The evaluation pipeline processes documents through a multi-stage architecture:

```
[ Upload Question & Answer PDF / Images ]
                  │
                  ▼
[ Client-Side Page Rasterization (pdfjs-dist + HTML5 Canvas) ]
                  │
                  ▼
[ Stage 1: Question Paper Extraction (Gemini API) ]
  • Identifies question hierarchy, numbers, and mark weights
  • Splits sub-parts (e.g., 6(a), 6(b), 1(i), 1(ii)) into distinct entries
  • Preserves exact printed sequence
                  │
                  ▼
[ Stage 2: Handwritten Answer OCR & Spatial Bounding Boxes (Gemini API) ]
  • Detects distinct handwritten answer blocks across all pages
  • Grounded bounding boxes [ymin, xmin, ymax, xmax] in normalized [0, 1] coordinates
  • Detects cross-page continuations and ignores non-answer noise / doodles
                  │
                  ▼
[ Stage 3: Deterministic + AI-Assisted Answer-to-Question Mapping ]
  • Phase 1: High-confidence exact question number matching
  • Phase 2: AI semantic resolution for mislabeled, unnumbered, or out-of-order answers
  • Flags unanswered questions and orphaned / unmatched student paragraphs
                  │
                  ▼
[ Interactive Spatial Results Screen ]
  • Split-view Question List and Answer Sheet Inspector
  • Click any question to auto-scroll and highlight exact bounding box regions on canvas
  • Summary statistics, page continuations, and confidence sanity alerts
```

---

## 🤖 AI Model & API Used

- **Primary Model**: `gemini-2.5-flash` (via Google GenAI SDK `@google/genai`)
- **Fallback Models**: `gemini-2.5-flash-lite`, `gemini-flash-latest`
- **Why Gemini?**:
  1. **Native Multimodal OCR & Spatial Grounding**: Gemini's vision models natively return normalized bounding box coordinates (`[ymin, xmin, ymax, xmax]`) directly alongside transcription and semantic labels in a single structured JSON pass.
  2. **Structured Outputs (`responseSchema`)**: Enables strict JSON schema enforcement so complex question trees and coordinate arrays parse reliably.
  3. **High Throughput & Speed**: Fast inference latency on multi-page exam documents with generous free-tier quotas.

---

## 📐 Assumptions & Limitations

1. **Single Student Answer Sheet**: Per design specifications, the pipeline evaluates one student's answer submission against one question paper at a time.
2. **Handwriting Legibility**: Highly illegible handwriting, heavy overwriting, or obscured text may reduce OCR transcription accuracy and question number guessing confidence.
3. **Bounding Box Grounding Precision**: Bounding box accuracy reflects the model's spatial perception; dense or irregular free-form handwriting may occasionally encompass surrounding whitespace or margins.
4. **In-Memory Browser State**: Document rasterization and intermediate extractions reside in-memory for security and responsiveness. Hard-refreshing the browser resets the current evaluation session.
5. **Document Pair Correspondence (Sanity Check)**: The app assumes the uploaded question paper and answer sheet belong to the same exam. If unmatched rates exceed 70%, a prominent **Sanity Check Warning Banner** alerts the evaluator to verify the files.
6. **API Quota & Upstream Availability**: Free-tier Gemini API keys are subject to rate limits (15–20 RPM). The pipeline includes automatic retry wrappers, a 45s timeout guard, and toast banners for rate limits (HTTP 429) or temporary capacity spikes (HTTP 503).
7. **Duplicate Answer Block Tie-Breaking**:
   - When multiple handwritten blocks reference the same question number (e.g. two blocks labeled "Q6"), the **first chronological occurrence in reading order** (earliest page / uppermost coordinate) is assigned to the primary question slot during high-confidence matching.
   - Any subsequent duplicate blocks remain in the candidate pool for AI semantic correlation. If the second block is an elaboration or page-spanning continuation, it is linked or flagged with its specific match reason rather than discarded.

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
Add your Gemini API Key:
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
