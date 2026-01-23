import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, FileText, X, AlertTriangle, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useClientOcr, OcrProgress } from '@/hooks/useClientOcr';
import { SupportedLanguage, LANGUAGE_CODES } from '@/lib/translations';

const PLACEHOLDER_TEXT = `Paste your lecture text here.

---

Вставьте текст лекции здесь.`;

export default function ReviewText() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Track if user has typed (to avoid overwriting)
  const userHasTypedRef = useRef(false);
  const ocrStartedRef = useRef(false);
  
  // OCR settings
  const [improvedQuality, setImprovedQuality] = useState(false);
  
  // OCR hook
  const { processImages, progress, cancel, isProcessing } = useClientOcr({
    improvedQuality,
  });
  
  // Text state - initialized once from sessionStorage or placeholder
  const [lectureText, setLectureText] = useState<string>(() => {
    if (typeof window === 'undefined') return PLACEHOLDER_TEXT;
    const saved = sessionStorage.getItem('lectureText');
    if (saved && saved !== PLACEHOLDER_TEXT) {
      userHasTypedRef.current = true; // User had previous text
      return saved;
    }
    return PLACEHOLDER_TEXT;
  });
  
  // Detected language from OCR
  const [detectedLanguage, setDetectedLanguage] = useState<SupportedLanguage | null>(null);
  
  // OCR warnings
  const [warnings, setWarnings] = useState<string[]>([]);
  
  // Local progress state for UI
  const [ocrProgress, setOcrProgress] = useState<OcrProgress>({
    current: 0,
    total: 0,
    status: 'idle',
  });

  // Handle text changes - mark as user-typed
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    userHasTypedRef.current = true;
    setLectureText(e.target.value);
  }, []);

  // Start OCR processing when page loads (if images exist and OCR not yet started)
  useEffect(() => {
    if (ocrStartedRef.current) return;
    
    const pendingOcr = sessionStorage.getItem('pendingOcr');
    const imagesJson = sessionStorage.getItem('materialImages');
    
    if (pendingOcr !== 'true' || !imagesJson) return;
    
    // Clear the flag so we don't re-run
    sessionStorage.removeItem('pendingOcr');
    ocrStartedRef.current = true;
    
    try {
      const images: string[] = JSON.parse(imagesJson);
      if (images.length === 0) return;
      
      console.log(`[ReviewText] Starting OCR for ${images.length} images`);
      
      processImages(images, (p) => {
        setOcrProgress(p);
      }).then((result) => {
        if (result && result.text) {
          // Only update if user hasn't typed yet
          if (!userHasTypedRef.current) {
            setLectureText(result.text);
            sessionStorage.setItem('lectureText', result.text);
          } else {
            toast.info('OCR complete. Your edits preserved.');
          }
          
          setDetectedLanguage(result.detectedLanguage);
          sessionStorage.setItem('detectedLanguage', result.detectedLanguage);
          
          if (result.warnings.length > 0) {
            setWarnings(result.warnings);
          }
          
          toast.success(`OCR complete (${LANGUAGE_CODES[result.detectedLanguage]})`);
        }
      }).catch((err) => {
        console.error('[ReviewText] OCR error:', err);
        toast.error('OCR failed. Please paste text manually.');
      });
      
    } catch (err) {
      console.error('[ReviewText] Failed to parse images:', err);
    }
  }, [processImages]);

  const handleBack = () => {
    cancel();
    navigate('/add-material');
  };

  const handleContinue = () => {
    if (lectureText.trim().length === 0 || lectureText === PLACEHOLDER_TEXT) {
      toast.error('Please enter some text');
      return;
    }
    sessionStorage.setItem('lectureText', lectureText);
    if (detectedLanguage) {
      sessionStorage.setItem('detectedLanguage', detectedLanguage);
    }
    navigate('/material-details');
  };

  const handleCancel = () => {
    cancel();
    toast.info('OCR cancelled');
  };

  const wordCount = lectureText.split(/\s+/).filter(Boolean).length;
  const charCount = lectureText.length;
  
  const showOcrStatus = ocrProgress.status !== 'idle' && ocrProgress.status !== 'done';
  const ocrFailed = ocrProgress.status === 'error';

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
          {/* Header with settings */}
          <div className="flex items-center gap-3 pb-2 border-b">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">{t('material.ocrResult')}</h2>
              <p className="text-xs text-muted-foreground">
                {t('material.editText')}
              </p>
            </div>
            {detectedLanguage && (
              <span className="text-xs bg-muted px-2 py-1 rounded">
                {LANGUAGE_CODES[detectedLanguage]}
              </span>
            )}
          </div>

          {/* Privacy hint */}
          <Alert variant="default" className="bg-accent/50 border-accent">
            <AlertTriangle className="h-4 w-4 text-accent-foreground" />
            <AlertDescription className="text-xs text-accent-foreground">
              Privacy: Do not upload patient personal data. Crop or blur sensitive information before saving.
            </AlertDescription>
          </Alert>

          {/* OCR Progress bar */}
          {showOcrStatus && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span className="text-sm font-medium">
                    {ocrProgress.message || 'Processing...'}
                  </span>
                </div>
                {isProcessing && (
                  <Button variant="ghost" size="sm" onClick={handleCancel}>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                )}
              </div>
              {ocrProgress.total > 0 && (
                <Progress 
                  value={(ocrProgress.current / ocrProgress.total) * 100} 
                  className="h-2" 
                />
              )}
            </div>
          )}

          {/* OCR Failed message */}
          {ocrFailed && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                OCR failed. Please paste your lecture text manually below.
              </AlertDescription>
            </Alert>
          )}

          {/* Warnings from OCR */}
          {warnings.length > 0 && !ocrFailed && (
            <Alert variant="default" className="bg-muted border-muted-foreground/20">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <AlertDescription className="text-xs text-muted-foreground">
                {warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {/* Quality toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="quality" className="text-sm cursor-pointer">
                Improve OCR (slower)
              </Label>
            </div>
            <Switch
              id="quality"
              checked={improvedQuality}
              onCheckedChange={setImprovedQuality}
              disabled={isProcessing}
            />
          </div>
          
          {/* Simple editable textarea */}
          <Textarea
            value={lectureText}
            onChange={handleTextChange}
            placeholder={PLACEHOLDER_TEXT}
            className="min-h-[350px] font-mono text-sm leading-relaxed resize-y"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          
          {/* Character/Word count */}
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
          disabled={lectureText.trim().length === 0 || lectureText === PLACEHOLDER_TEXT}
          onClick={handleContinue}
        >
          <ArrowRight className="mr-2 h-5 w-5" />
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
