import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface OcrResult {
  text: string;
  confidence: 'high' | 'medium' | 'low';
}

const MOCK_OCR_TEXT = `MOCK OCR: Вставьте текст вашей лекции здесь.

Функция OCR будет включена позже. Пока вы можете:
1. Вручную ввести текст лекции
2. Скопировать и вставить текст из другого источника

---

MOCK OCR: Paste your lecture text here.

The OCR feature will be enabled later. For now, you can:
1. Manually enter lecture text
2. Copy and paste text from another source`;

export function useOcr() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processImage = async (imageBase64: string, useMock = false): Promise<OcrResult | null> => {
    // If mock mode is requested, return placeholder immediately
    if (useMock) {
      return {
        text: MOCK_OCR_TEXT,
        confidence: 'low',
      };
    }

    try {
      console.log('Starting OCR processing via Gemini Vision...');
      
      const { data, error: fnError } = await supabase.functions.invoke('process-ocr', {
        body: { imageBase64 },
      });

      if (fnError) {
        console.error('OCR function error:', fnError);
        throw new Error(fnError.message || 'OCR processing failed');
      }

      if (data?.error) {
        console.error('OCR response error:', data.error);
        throw new Error(data.error);
      }

      console.log('OCR completed successfully');
      return {
        text: data?.text || '',
        confidence: data?.confidence || 'medium',
      };
    } catch (err) {
      console.error('OCR error, falling back to mock:', err);
      // Return null to trigger fallback in processMultipleImages
      return null;
    }
  };

  const processMultipleImages = async (images: string[]): Promise<OcrResult | null> => {
    if (images.length === 0) {
      setError('Please upload at least one photo');
      return null;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const results: OcrResult[] = [];
      let allFailed = true;
      
      for (let i = 0; i < images.length; i++) {
        console.log(`Processing image ${i + 1} of ${images.length}...`);
        const result = await processImage(images[i], false);
        
        if (result && result.text.trim()) {
          results.push(result);
          allFailed = false;
        }
      }

      // If all OCR attempts failed, use mock OCR as fallback
      if (allFailed || results.length === 0) {
        console.log('All OCR attempts failed, using mock OCR fallback');
        return {
          text: MOCK_OCR_TEXT,
          confidence: 'low',
        };
      }

      // Combine all texts in order
      const combinedText = results.map((r, idx) => {
        if (results.length > 1) {
          return `--- Страница ${idx + 1} / Page ${idx + 1} ---\n\n${r.text}`;
        }
        return r.text;
      }).join('\n\n');
      
      // Use lowest confidence level from all results
      const confidenceLevels = ['high', 'medium', 'low'] as const;
      const lowestConfidence = results.reduce((lowest, r) => {
        const currentIndex = confidenceLevels.indexOf(r.confidence);
        const lowestIndex = confidenceLevels.indexOf(lowest);
        return currentIndex > lowestIndex ? r.confidence : lowest;
      }, 'high' as const);

      return {
        text: combinedText,
        confidence: lowestConfidence,
      };
    } catch (err) {
      console.error('processMultipleImages error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      
      // Even on error, return mock so flow continues
      return {
        text: MOCK_OCR_TEXT,
        confidence: 'low',
      };
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    processImage,
    processMultipleImages,
    isProcessing,
    error,
  };
}
