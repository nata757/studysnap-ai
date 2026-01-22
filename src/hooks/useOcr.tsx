import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface OcrResult {
  text: string;
  confidence: 'high' | 'medium' | 'low';
}

export function useOcr() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processImage = async (imageBase64: string): Promise<OcrResult | null> => {
    setIsProcessing(true);
    setError(null);

    try {
      console.log('Starting OCR processing...');
      
      const { data, error: fnError } = await supabase.functions.invoke('process-ocr', {
        body: { imageBase64 },
      });

      if (fnError) {
        console.error('OCR function error:', fnError);
        setError(fnError.message || 'OCR processing failed');
        return null;
      }

      if (data.error) {
        console.error('OCR response error:', data.error);
        setError(data.error);
        return null;
      }

      console.log('OCR completed successfully');
      return {
        text: data.text || '',
        confidence: data.confidence || 'medium',
      };
    } catch (err) {
      console.error('OCR error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  const processMultipleImages = async (images: string[]): Promise<OcrResult | null> => {
    if (images.length === 0) return null;

    const results: OcrResult[] = [];
    
    for (const image of images) {
      const result = await processImage(image);
      if (result) {
        results.push(result);
      }
    }

    if (results.length === 0) return null;

    // Combine all texts
    const combinedText = results.map((r) => r.text).join('\n\n---\n\n');
    
    // Use lowest confidence level
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
  };

  return {
    processImage,
    processMultipleImages,
    isProcessing,
    error,
  };
}
