import { useState, useRef, useCallback } from 'react';
import { createWorker, Worker, OEM, PSM } from 'tesseract.js';
import { SupportedLanguage, detectSourceLanguage } from '@/lib/translations';

export interface OcrProgress {
  current: number;
  total: number;
  status: 'idle' | 'loading' | 'processing' | 'done' | 'error' | 'cancelled';
  message?: string;
}

export interface ClientOcrResult {
  text: string;
  detectedLanguage: SupportedLanguage;
  warnings: string[];
}

interface UseClientOcrOptions {
  timeoutPerImage?: number;
  improvedQuality?: boolean;
}

const DEFAULT_TIMEOUT = 12000; // 12 seconds per image
const IMPROVED_TIMEOUT = 25000; // 25 seconds for improved quality

/**
 * Detect language hint for Tesseract based on simple character analysis
 * Returns tesseract language codes
 */
function detectLanguageHint(imageData?: string): string {
  // Default to English if no data
  if (!imageData) return 'eng';
  
  // We can't really detect from image data before OCR
  // So default to 'eng+deu+rus' multi-language
  return 'eng+deu+rus';
}

/**
 * Map detected text language to Tesseract language for potential re-run
 */
function getTesseractLangCode(lang: SupportedLanguage): string {
  switch (lang) {
    case 'ru': return 'rus';
    case 'de': return 'deu';
    case 'en': return 'eng';
    default: return 'eng';
  }
}

export function useClientOcr(options: UseClientOcrOptions = {}) {
  const { timeoutPerImage = DEFAULT_TIMEOUT, improvedQuality = false } = options;
  
  const [progress, setProgress] = useState<OcrProgress>({
    current: 0,
    total: 0,
    status: 'idle',
  });
  
  const cancelledRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);

  const cleanup = useCallback(async () => {
    if (workerRef.current) {
      try {
        await workerRef.current.terminate();
      } catch (e) {
        console.warn('Worker cleanup error:', e);
      }
      workerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setProgress(prev => ({ ...prev, status: 'cancelled', message: 'OCR cancelled' }));
    cleanup();
  }, [cleanup]);

  const processImages = useCallback(async (
    images: string[],
    onProgress?: (p: OcrProgress) => void
  ): Promise<ClientOcrResult | null> => {
    if (images.length === 0) {
      return null;
    }

    cancelledRef.current = false;
    const warnings: string[] = [];
    const textParts: string[] = [];
    const timeout = improvedQuality ? IMPROVED_TIMEOUT : timeoutPerImage;

    setProgress({ current: 0, total: images.length, status: 'loading', message: 'Loading OCR engine...' });
    onProgress?.({ current: 0, total: images.length, status: 'loading', message: 'Loading OCR engine...' });

    try {
      // Create worker with multi-language support
      console.log('[OCR] Creating Tesseract worker...');
      const worker = await createWorker('eng+deu+rus', OEM.LSTM_ONLY, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            console.log(`[OCR] Recognition progress: ${pct}%`);
          }
        },
      });
      
      workerRef.current = worker;

      // Set PSM for better text detection
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
      });

      console.log('[OCR] Worker ready, processing images...');

      // Process each image sequentially
      for (let i = 0; i < images.length; i++) {
        if (cancelledRef.current) {
          console.log('[OCR] Cancelled by user');
          break;
        }

        const imageNum = i + 1;
        setProgress({
          current: imageNum,
          total: images.length,
          status: 'processing',
          message: `OCR ${imageNum}/${images.length}`,
        });
        onProgress?.({
          current: imageNum,
          total: images.length,
          status: 'processing',
          message: `OCR ${imageNum}/${images.length}`,
        });

        try {
          // Create timeout promise
          const timeoutPromise = new Promise<null>((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), timeout);
          });

          // OCR promise
          const ocrPromise = worker.recognize(images[i]);

          // Race between OCR and timeout
          const result = await Promise.race([ocrPromise, timeoutPromise]);

          if (result && result.data && result.data.text) {
            const cleanedText = result.data.text.trim();
            if (cleanedText) {
              if (images.length > 1) {
                textParts.push(`--- Page ${imageNum} ---\n\n${cleanedText}`);
              } else {
                textParts.push(cleanedText);
              }
              console.log(`[OCR] Image ${imageNum} completed, ${cleanedText.length} chars`);
            } else {
              warnings.push(`Page ${imageNum}: No text detected`);
            }
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          console.warn(`[OCR] Image ${imageNum} failed:`, errorMsg);
          
          if (errorMsg === 'timeout') {
            warnings.push(`Page ${imageNum}: Timed out after ${timeout / 1000}s`);
          } else {
            warnings.push(`Page ${imageNum}: ${errorMsg}`);
          }
        }
      }

      await cleanup();

      if (cancelledRef.current) {
        setProgress({ current: 0, total: images.length, status: 'cancelled' });
        return null;
      }

      const mergedText = textParts.join('\n\n');
      
      if (!mergedText) {
        setProgress({
          current: images.length,
          total: images.length,
          status: 'error',
          message: 'OCR failed. Paste text manually.',
        });
        onProgress?.({
          current: images.length,
          total: images.length,
          status: 'error',
          message: 'OCR failed. Paste text manually.',
        });
        return null;
      }

      // Detect language from extracted text
      const detectedLanguage = detectSourceLanguage(mergedText);
      console.log(`[OCR] Detected language: ${detectedLanguage}`);

      setProgress({
        current: images.length,
        total: images.length,
        status: 'done',
        message: 'OCR complete',
      });
      onProgress?.({
        current: images.length,
        total: images.length,
        status: 'done',
        message: 'OCR complete',
      });

      return {
        text: mergedText,
        detectedLanguage,
        warnings,
      };

    } catch (err) {
      console.error('[OCR] Critical error:', err);
      await cleanup();
      
      setProgress({
        current: 0,
        total: images.length,
        status: 'error',
        message: 'OCR failed. Paste text manually.',
      });
      onProgress?.({
        current: 0,
        total: images.length,
        status: 'error',
        message: 'OCR failed. Paste text manually.',
      });
      
      return null;
    }
  }, [timeoutPerImage, improvedQuality, cleanup]);

  return {
    processImages,
    progress,
    cancel,
    isProcessing: progress.status === 'loading' || progress.status === 'processing',
  };
}
