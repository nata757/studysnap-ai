import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ConfidenceBadge } from '@/components/ai/ConfidenceBadge';
import { useOcr } from '@/hooks/useOcr';
import { toast } from 'sonner';

const MOCK_LECTURE_TEXT = `Paste your lecture text here. OCR will be enabled later.

---

Вставьте текст лекции здесь. OCR будет включён позже.`;

const OCR_TIMEOUT_MS = 8000;

export default function ReviewText() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { processMultipleImages } = useOcr();
  
  const [lectureText, setLectureText] = useState(MOCK_LECTURE_TEXT);
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('low');
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  
  const ocrStartedRef = useRef(false);

  // Run OCR in background on mount if pending
  useEffect(() => {
    const runBackgroundOcr = async () => {
      if (ocrStartedRef.current) return;
      
      const pendingOcr = sessionStorage.getItem('pendingOcr');
      if (pendingOcr !== 'true') {
        const savedText = sessionStorage.getItem('lectureText');
        const savedConfidence = sessionStorage.getItem('ocrConfidence');
        if (savedText) setLectureText(savedText);
        if (savedConfidence) setConfidence(savedConfidence as 'high' | 'medium' | 'low');
        return;
      }
      
      ocrStartedRef.current = true;
      sessionStorage.removeItem('pendingOcr');
      
      const imagesJson = sessionStorage.getItem('materialImages');
      if (!imagesJson) {
        toast.info('No images found, using placeholder text');
        return;
      }
      
      const images: string[] = JSON.parse(imagesJson);
      if (images.length === 0) {
        toast.info('No images to process');
        return;
      }
      
      setIsProcessingOcr(true);
      toast.info('Processing images in background...');
      
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), OCR_TIMEOUT_MS);
      });
      
      try {
        const result = await Promise.race([
          processMultipleImages(images),
          timeoutPromise
        ]);
        
        if (result === null) {
          console.log('OCR timeout after', OCR_TIMEOUT_MS, 'ms');
          toast.warning('OCR timed out - using placeholder text');
        } else if (result && result.text && result.text.trim()) {
          setLectureText(result.text);
          setConfidence(result.confidence);
          sessionStorage.setItem('lectureText', result.text);
          sessionStorage.setItem('ocrConfidence', result.confidence);
          toast.success('Text extracted successfully!');
        } else {
          toast.info('OCR returned no text - edit manually');
        }
      } catch (err) {
        console.error('OCR error:', err);
        toast.error('OCR failed - edit text manually');
      } finally {
        setIsProcessingOcr(false);
      }
    };
    
    runBackgroundOcr();
  }, [processMultipleImages]);

  // Save text to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('lectureText', lectureText);
  }, [lectureText]);

  const handleBack = () => {
    navigate('/add-material');
  };

  const handleContinue = () => {
    if (lectureText.trim().length === 0) {
      toast.error('Please enter some text');
      return;
    }
    sessionStorage.setItem('lectureText', lectureText);
    sessionStorage.setItem('ocrConfidence', confidence);
    navigate('/material-details');
  };

  const wordCount = lectureText.split(/\s+/).filter(Boolean).length;
  const charCount = lectureText.length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold">{t('material.add')}</h1>
            <p className="text-xs text-muted-foreground">
              {t('common.step')} 2 / 3
            </p>
          </div>
        </div>
        <Progress value={66} className="mt-2 h-1" />
      </header>

      {/* Content */}
      <main className="flex-1 p-4 pb-24">
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">{t('material.ocrResult')}</h2>
              <p className="text-xs text-muted-foreground">
                {isProcessingOcr ? 'Processing...' : t('material.editText')}
              </p>
            </div>
            {isProcessingOcr ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">OCR...</span>
              </div>
            ) : (
              <ConfidenceBadge confidence={confidence} />
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="lecture-text" className="sr-only">
              Lecture Text
            </Label>
            <Textarea
              id="lecture-text"
              value={lectureText}
              onChange={(e) => setLectureText(e.target.value)}
              placeholder={MOCK_LECTURE_TEXT}
              className="min-h-[400px] font-mono text-sm leading-relaxed resize-y"
              autoFocus
            />
          </div>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{charCount} characters</span>
            <span>{wordCount} words</span>
          </div>
        </div>
      </main>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
        <Button
          className="w-full"
          size="lg"
          disabled={lectureText.trim().length === 0}
          onClick={handleContinue}
        >
          <ArrowRight className="mr-2 h-5 w-5" />
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
