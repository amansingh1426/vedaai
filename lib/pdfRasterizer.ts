import type { PageImage, ProcessedDocument } from './types';

/**
 * Client-side PDF and Image rasterizer using pdfjs-dist.
 * Converts uploaded PDF or image files into PageImage objects (data URLs) with dimensions.
 */
export async function rasterizePdfOrImage(
  file: File,
  type: 'question_paper' | 'answer_sheet',
  onProgress?: (current: number, total: number) => void
): Promise<ProcessedDocument> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);

  if (isPdf) {
    return rasterizePdf(file, type, onProgress);
  } else if (isImage) {
    const pageImage = await rasterizeImageFile(file, 0);
    if (onProgress) onProgress(1, 1);
    return {
      name: file.name,
      type,
      pages: [pageImage],
    };
  } else {
    // Fallback for mock test data or unrecognized text formats
    const fallbackImage = await createFallbackCanvasPage(file, 0);
    if (onProgress) onProgress(1, 1);
    return {
      name: file.name,
      type,
      pages: [fallbackImage],
    };
  }
}

/**
 * Rasterize all pages of a PDF file using pdfjs-dist
 */
async function rasterizePdf(
  file: File,
  type: 'question_paper' | 'answer_sheet',
  onProgress?: (current: number, total: number) => void
): Promise<ProcessedDocument> {
  if (typeof window === 'undefined') {
    throw new Error('PDF rasterization must execute client-side in the browser.');
  }

  // Dynamically import pdfjs-dist on client side
  const pdfjs = await import('pdfjs-dist');
  
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      // Use locally hosted static worker from /public/pdf.worker.min.mjs
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('/pdf.worker.min.mjs', window.location.origin).toString();
    } catch {
      // Fallback for isolated environments
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
  }

  const arrayBuffer = await file.arrayBuffer();

  try {
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const pages: PageImage[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      
      // Use 1.5x scale for crisp OCR & UI display balance
      const desiredScale = 1.5;
      const viewport = page.getViewport({ scale: desiredScale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        throw new Error(`Failed to create 2D canvas context for page ${pageNum}`);
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };

      // @ts-expect-error pdfjs typing nuance with canvasContext
      await page.render(renderContext).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

      pages.push({
        pageIndex: pageNum - 1,
        dataUrl,
        width: viewport.width,
        height: viewport.height,
      });

      if (onProgress) {
        onProgress(pageNum, numPages);
      }
    }

    return {
      name: file.name,
      type,
      pages,
    };
  } catch (error) {
    console.warn(`PDF parsing via pdfjs failed, falling back to mock renderer:`, error);
    // If it was a mock file (like in handleLoadSample) or corrupted PDF, generate a clean placeholder
    const fallbackImage = await createFallbackCanvasPage(file, 0);
    return {
      name: file.name,
      type,
      pages: [fallbackImage],
    };
  }
}

/**
 * Handle direct image upload (PNG, JPG, etc.)
 */
function rasterizeImageFile(file: File, pageIndex: number): Promise<PageImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context failed'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve({
          pageIndex,
          dataUrl: canvas.toDataURL('image/jpeg', 0.92),
          width: img.width,
          height: img.height,
        });
      };
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Clean fallback canvas for synthetic mock files (e.g. new File(["sample..."], "sample.pdf"))
 */
async function createFallbackCanvasPage(file: File, pageIndex: number): Promise<PageImage> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header bar
    ctx.fillStyle = '#4338ca';
    ctx.fillRect(40, 40, canvas.width - 80, 8);

    // Title text
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(`Sample Document: ${file.name}`, 60, 110);

    ctx.fillStyle = '#64748b';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Size: ${(file.size / 1024).toFixed(1)} KB • Generated for VedaAI Preview`, 60, 150);

    // Document mock lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    for (let y = 200; y < 1500; y += 45) {
      ctx.beginPath();
      ctx.moveTo(60, y);
      ctx.lineTo(canvas.width - 60, y);
      ctx.stroke();
    }

    // Watermark text
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'italic 24px sans-serif';
    ctx.fillText('VedaAI Automated Evaluation Fixture Page', 60, 300);
  }

  return {
    pageIndex,
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    width: 1200,
    height: 1600,
  };
}
