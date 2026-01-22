import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, FileText, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ConfidenceBadge } from '@/components/ai/ConfidenceBadge';
import { useOcr } from '@/hooks/useOcr';
import { toast } from 'sonner';

const PLACEHOLDER_TEXT = `Paste your lecture text here. OCR will be enabled later.

---

Вставьте текст лекции здесь. OCR будет включён позже.`;

const OCR_TIMEOUT_MS = 8000;

export default function ReviewText() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { processMultipleImages } = useOcr();
  
  // Two separate states:
  // 1. ocrText - holds raw OCR result (read-only after set)
  // 2. lectureTextDraft - user's editable draft
  const [ocrText, setOcrText] = useState<string>('');
  const [lectureTextDraft, setLectureTextDraft] = useState<string>('');
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('low');
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  
  // Refs to prevent double-execution and track initialization
  const ocrStartedRef = useRef(false);
  const draftInitializedRef = useRef(false);

  // Initialize draft ONCE on mount
  useEffect(() => {
    if (draftInitializedRef.current) return;
    draftInitializedRef.current = true;
    
    // Try to load existing draft from sessionStorage first
    const savedDraft = sessionStorage.getItem('lectureTextDraft');
    if (savedDraft) {
      setLectureTextDraft(savedDraft);
      return;
    }
    
    // Otherwise, use saved OCR text or placeholder
    const savedOcrText = sessionStorage.getItem('lectureText');
    if (savedOcrText) {
      setOcrText(savedOcrText);
      setLectureTextDraft(savedOcrText);
    } else {
      setLectureTextDraft(PLACEHOLDER_TEXT);
    }
    
    const savedConfidence = sessionStorage.getItem('ocrConfidence');
    if (savedConfidence) {
      setConfidence(savedConfidence as 'high' | 'medium' | 'low');
    }
  }, []);

  // Run OCR in background (updates ocrText but does NOT overwrite lectureTextDraft)
  useEffect(() => {
    const runBackgroundOcr = async () => {
      if (ocrStartedRef.current) return;
      
      const pendingOcr = sessionStorage.getItem('pendingOcr');
      if (pendingOcr !== 'true') return;
      
      ocrStartedRef.current = true;
      sessionStorage.removeItem('pendingOcr');
      
      const imagesJson = sessionStorage.getItem('materialImages');
      if (!imagesJson) return;
      
      const images: string[] = JSON.parse(imagesJson);
      if (images.length === 0) return;
      
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
          toast.warning('OCR timed out');
        } else if (result && result.text && result.text.trim()) {
          // Store OCR result
          setOcrText(result.text);
          setConfidence(result.confidence);
          sessionStorage.setItem('lectureText', result.text);
          sessionStorage.setItem('ocrConfidence', result.confidence);
          
          // Only update draft if user hasn't started editing (draft is still placeholder)
          if (lectureTextDraft === PLACEHOLDER_TEXT || lectureTextDraft === '') {
            setLectureTextDraft(result.text);
            sessionStorage.setItem('lectureTextDraft', result.text);
          } else {
            // User has edited - show notification instead of overwriting
            toast.success('OCR completed! Your edits were preserved.');
          }
        }
      } catch (err) {
        console.error('OCR error:', err);
        toast.error('OCR failed');
      } finally {
        setIsProcessingOcr(false);
      }
    };
    
    runBackgroundOcr();
  }, [processMultipleImages, lectureTextDraft]);

  // Handle draft changes - save to sessionStorage with debounce indicator
  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLectureTextDraft(newValue);
    sessionStorage.setItem('lectureTextDraft', newValue);
    
    // Show "Saved locally" indicator
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 1500);
  };

  const handleBack = () => {
    navigate('/add-material');
  };

  const handleContinue = () => {
    if (lectureTextDraft.trim().length === 0) {
      toast.error('Please enter some text');
      return;
    }
    // Save the draft as the final lecture text
    sessionStorage.setItem('lectureText', lectureTextDraft);
    sessionStorage.setItem('ocrConfidence', confidence);
    navigate('/material-details');
  };

  const wordCount = lectureTextDraft.split(/\s+/).filter(Boolean).length;
  const charCount = lectureTextDraft.length;

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
              value={lectureTextDraft}
              onChange={handleDraftChange}
              placeholder={PLACEHOLDER_TEXT}
              className="min-h-[400px] font-mono text-sm leading-relaxed resize-y"
              autoFocus
            />
          </div>
          
          {/* Character/Word count + Saved indicator */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{charCount} characters</span>
            <div className="flex items-center gap-2">
              {showSaved && (
                <span className="flex items-center gap-1 text-primary">
                  <Check className="h-3 w-3" />
                  Saved locally
                </span>
              )}
              <span>{wordCount} words</span>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
        <Button
          className="w-full"
          size="lg"
          disabled={lectureTextDraft.trim().length === 0}
          onClick={handleContinue}
        >
          <ArrowRight className="mr-2 h-5 w-5" />
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
