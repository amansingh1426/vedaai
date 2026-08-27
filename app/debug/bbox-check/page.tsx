'use client';

import React, { useState, useEffect } from 'react';
import { rasterizePdfOrImage } from '@/lib/pdfRasterizer';
import type { PageImage } from '@/lib/types';

interface BBoxItem {
  id?: string;
  questionNumberGuess?: string | null;
  questionNumber?: string | null;
  text?: string;
  pageIndex?: number;
  bbox?: {
    ymin?: number;
    xmin?: number;
    ymax?: number;
    xmax?: number;
    top?: number;
    left?: number;
    bottom?: number;
    right?: number;
  };
  box?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  box_2d?: [number, number, number, number];
  continuesFromPageIndex?: number | null;
}

const SAMPLE_DEBUG_JSON: BBoxItem[] = [
  {
    questionNumberGuess: '1',
    text: 'Newton\'s 2nd Law states that the rate of change of momentum is proportional to applied force: F = ma.',
    pageIndex: 0,
    bbox: { ymin: 0.12, xmin: 0.08, ymax: 0.28, xmax: 0.92 },
    continuesFromPageIndex: null,
  },
  {
    questionNumberGuess: '3(a)',
    text: 'Derivation: v = u + at => s = ut + 0.5at^2 => v^2 = u^2 + 2as by eliminating time t.',
    pageIndex: 0,
    bbox: { ymin: 0.35, xmin: 0.08, ymax: 0.60, xmax: 0.92 },
    continuesFromPageIndex: null,
  },
  {
    questionNumberGuess: null,
    text: 'Extra scratch work: integrating dx/dt and checking units [m/s^2].',
    pageIndex: 0,
    bbox: { ymin: 0.65, xmin: 0.10, ymax: 0.85, xmax: 0.60 },
    continuesFromPageIndex: null,
  },
  {
    questionNumberGuess: '3(b)',
    text: 'Conservation of linear momentum: in an isolated system, total momentum before collision equals total momentum after collision.',
    pageIndex: 1,
    bbox: { ymin: 0.10, xmin: 0.08, ymax: 0.35, xmax: 0.92 },
    continuesFromPageIndex: 0,
  },
  {
    questionNumberGuess: '2',
    text: 'F = 50N, m = 10kg => a = F/m = 50/10 = 5 m/s^2.',
    pageIndex: 1,
    bbox: { ymin: 0.40, xmin: 0.08, ymax: 0.65, xmax: 0.85 },
    continuesFromPageIndex: null,
  }
];

export default function BBoxDebugPage() {
  const [jsonInput, setJsonInput] = useState<string>(JSON.stringify(SAMPLE_DEBUG_JSON, null, 2));
  const [parsedItems, setParsedItems] = useState<BBoxItem[]>(SAMPLE_DEBUG_JSON);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageImage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Parse JSON whenever textarea changes
  useEffect(() => {
    if (!jsonInput.trim()) {
      setParsedItems([]);
      setParseError(null);
      return;
    }
    try {
      const parsed = JSON.parse(jsonInput);
      let list: BBoxItem[] = [];
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const candidate = parsed.answers || parsed.answerBlocks || parsed.items || Object.values(parsed).find(v => Array.isArray(v));
        if (Array.isArray(candidate)) {
          list = candidate;
        } else {
          list = [parsed];
        }
      }
      setParsedItems(list);
      setParseError(null);
    } catch (e: any) {
      setParseError(`JSON parse error: ${e.message}`);
    }
  }, [jsonInput]);

  // Handle file upload for Answer Sheet
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const doc = await rasterizePdfOrImage(file, 'answer_sheet');
      setPages(doc.pages);
    } catch (err: any) {
      alert(`Error loading file: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Run live extraction on uploaded pages
  const handleLiveExtract = async () => {
    if (pages.length === 0) {
      alert('Please upload an Answer Sheet PDF or image first.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/extract-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to extract answers');
      }
      setJsonInput(JSON.stringify(data.answers, null, 2));
    } catch (err: any) {
      alert(`Extraction failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Calculate highest page index present in parsed JSON if no pages are uploaded
  const maxJsonPageIndex = parsedItems.reduce((max, item) => {
    const p = typeof item.pageIndex === 'number' ? item.pageIndex : 0;
    return Math.max(max, p);
  }, 0);

  const displayPageCount = Math.max(pages.length, maxJsonPageIndex + 1);

  // Normalize bounding box coordinates
  const getNormalizedBox = (item: BBoxItem) => {
    let ymin = 0;
    let xmin = 0;
    let ymax = 0.2;
    let xmax = 0.8;

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

    return {
      top: Math.max(0, Math.min(100, ymin * 100)),
      left: Math.max(0, Math.min(100, xmin * 100)),
      width: Math.max(2, Math.min(100, (xmax - xmin) * 100)),
      height: Math.max(2, Math.min(100, (ymax - ymin) * 100)),
    };
  };

  const matchedCount = parsedItems.filter(i => Boolean(i.questionNumberGuess || i.questionNumber)).length;
  const unmatchedCount = parsedItems.length - matchedCount;
  const continuesCount = parsedItems.filter(i => typeof i.continuesFromPageIndex === 'number').length;

  return (
    <div style={{ fontFamily: 'monospace', padding: 24, maxWidth: 1400, margin: '0 auto', background: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ borderBottom: '1px solid #334155', paddingBottom: 16, marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px 0', color: '#38bdf8' }}>🛠️ Bounding Box Visual Debugger</h1>
        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
          Inspect and verify normalized [ymin, xmin, ymax, xmax] bounding boxes returned from <code>/api/extract-answers</code>.
        </p>
      </div>

      {/* Top Controls Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Left Column: JSON input */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontWeight: 'bold', fontSize: 14, color: '#e2e8f0' }}>Paste JSON Array:</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setJsonInput(JSON.stringify(SAMPLE_DEBUG_JSON, null, 2))}
                style={{ padding: '4px 10px', fontSize: 12, background: '#1e293b', border: '1px solid #475569', color: '#38bdf8', borderRadius: 4, cursor: 'pointer' }}
              >
                Load Sample JSON
              </button>
              <button
                onClick={() => setJsonInput('[]')}
                style={{ padding: '4px 10px', fontSize: 12, background: '#1e293b', border: '1px solid #475569', color: '#cbd5e1', borderRadius: 4, cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          </div>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            rows={12}
            style={{
              width: '100%',
              background: '#020617',
              color: '#a5f3fc',
              border: parseError ? '1px solid #ef4444' : '1px solid #334155',
              borderRadius: 6,
              padding: 12,
              fontSize: 12,
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            }}
            placeholder='Paste JSON array [{ "questionNumberGuess": "1", "text": "...", "pageIndex": 0, "bbox": {"ymin":0.1, "xmin":0.1, "ymax":0.3, "xmax":0.9} }]'
          />
          {parseError && (
            <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{parseError}</div>
          )}
        </div>

        {/* Right Column: Upload & Live Extraction Controls */}
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, border: '1px solid #334155' }}>
          <h2 style={{ fontSize: 15, margin: '0 0 12px 0', color: '#f1f5f9' }}>Answer Sheet Document</h2>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Upload Answer Sheet (PDF or Image):</label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileUpload}
              style={{ fontSize: 12, color: '#cbd5e1' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <button
              onClick={handleLiveExtract}
              disabled={loading || pages.length === 0}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 'bold',
                background: pages.length > 0 ? '#0284c7' : '#475569',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                cursor: pages.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? 'Calling Gemini API...' : '⚡ Run Live /api/extract-answers'}
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              {pages.length > 0 ? `${pages.length} page(s) loaded` : 'No document uploaded (using blank canvas)'}
            </span>
          </div>

          {/* Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, borderTop: '1px solid #334155', paddingTop: 12 }}>
            <div style={{ background: '#0f172a', padding: 8, borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Total Blocks</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#f8fafc' }}>{parsedItems.length}</div>
            </div>
            <div style={{ background: '#064e3b', padding: 8, borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6ee7b7' }}>Matched (Green)</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#34d399' }}>{matchedCount}</div>
            </div>
            <div style={{ background: '#7f1d1d', padding: 8, borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#fca5a5' }}>Unmatched (Red)</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#f87171' }}>{unmatchedCount}</div>
            </div>
            <div style={{ background: '#312e81', padding: 8, borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#c7d2fe' }}>Continuations</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#818cf8' }}>{continuesCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pages Container with BBox Overlays */}
      <div>
        <h2 style={{ fontSize: 16, margin: '0 0 16px 0', color: '#e2e8f0' }}>Rendered Answer Sheet Pages & Overlays:</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {Array.from({ length: displayPageCount }).map((_, pIdx) => {
            const pageImage = pages[pIdx];
            const pageItems = parsedItems
              .map((item, originalIdx) => ({ item, originalIdx }))
              .filter(({ item }) => (typeof item.pageIndex === 'number' ? item.pageIndex : 0) === pIdx);

            return (
              <div
                key={pIdx}
                style={{
                  background: '#1e293b',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #334155',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
                  <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>📄 Page {pIdx + 1}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>
                    {pageItems.length} answer block{pageItems.length !== 1 ? 's' : ''} on this page
                  </span>
                </div>

                {/* Relative Canvas Container */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 900,
                    margin: '0 auto',
                    background: '#ffffff',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    minHeight: pageImage ? 'auto' : 700,
                    aspectRatio: pageImage ? `${pageImage.width} / ${pageImage.height}` : '1 / 1.414',
                  }}
                >
                  {/* Background Image if uploaded */}
                  {pageImage ? (
                    <img
                      src={pageImage.dataUrl}
                      alt={`Page ${pIdx + 1}`}
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                    />
                  ) : (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#94a3b8',
                        background: 'repeating-linear-gradient(0deg, #f8fafc, #f8fafc 30px, #e2e8f0 31px)',
                        padding: 20,
                        textAlign: 'center',
                      }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 'bold', color: '#64748b' }}>
                        [Page {pIdx + 1} - Blank Canvas (Upload Answer Sheet PDF/Image to view actual handwriting)]
                      </span>
                    </div>
                  )}

                  {/* Bounding Box Overlays */}
                  {pageItems.map(({ item, originalIdx }) => {
                    const norm = getNormalizedBox(item);
                    const qGuess = item.questionNumberGuess || item.questionNumber;
                    const isMatched = Boolean(qGuess);
                    const isHovered = hoveredIdx === originalIdx;

                    const borderColor = isMatched ? '#10b981' : '#f43f5e';
                    const bgColor = isMatched ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)';
                    const tagBg = isMatched ? '#059669' : '#e11d48';

                    return (
                      <div
                        key={originalIdx}
                        onMouseEnter={() => setHoveredIdx(originalIdx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        style={{
                          position: 'absolute',
                          top: `${norm.top}%`,
                          left: `${norm.left}%`,
                          width: `${norm.width}%`,
                          height: `${norm.height}%`,
                          border: `2px solid ${borderColor}`,
                          backgroundColor: bgColor,
                          boxSizing: 'border-box',
                          zIndex: isHovered ? 20 : 10,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isHovered ? '0 0 12px rgba(0,0,0,0.4)' : 'none',
                        }}
                      >
                        {/* Question Guess Badge / Tag */}
                        <div
                          style={{
                            position: 'absolute',
                            top: -24,
                            left: 0,
                            background: tagBg,
                            color: '#ffffff',
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 'bold',
                            borderRadius: '3px 3px 0 0',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            gap: 6,
                            alignItems: 'center',
                          }}
                        >
                          <span>{isMatched ? `Q: ${qGuess}` : '⚠️ UNMATCHED'}</span>
                          {typeof item.continuesFromPageIndex === 'number' && (
                            <span
                              style={{
                                background: '#312e81',
                                color: '#e0e7ff',
                                padding: '1px 5px',
                                borderRadius: 3,
                                fontSize: 10,
                              }}
                            >
                              ↳ continues from p.{item.continuesFromPageIndex + 1}
                            </span>
                          )}
                        </div>

                        {/* Hover Text Tooltip Preview */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 4,
                            left: 4,
                            right: 4,
                            background: 'rgba(15, 23, 42, 0.88)',
                            color: '#f1f5f9',
                            padding: '4px 8px',
                            fontSize: 10,
                            borderRadius: 3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: isHovered ? 'normal' : 'nowrap',
                            maxHeight: isHovered ? 120 : 22,
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            pointerEvents: 'none',
                          }}
                        >
                          {item.text || 'No transcribed text'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
