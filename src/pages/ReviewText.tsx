import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ConfidenceBadge } from '@/components/ai/ConfidenceBadge';

const MOCK_PLACEHOLDER = `MOCK OCR: Paste your lecture text here. OCR will be enabled later.

---

MOCK OCR: Вставьте текст лекции здесь. OCR будет включён позже.`;

export default function ReviewText() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [ocrText, setOcrText] = useState('');
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('low');

  // Load state from sessionStorage on mount
  useEffect(() => {
    const savedText = sessionStorage.getItem('ocrText');
    const savedConfidence = sessionStorage.getItem('ocrConfidence');
    
    if (savedText) {
      setOcrText(savedText);
    } else {
      setOcrText(MOCK_PLACEHOLDER);
    }
    
    if (savedConfidence) {
      setConfidence(savedConfidence as 'high' | 'medium' | 'low');
    }
  }, []);

  // Save text to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('ocrText', ocrText);
  }, [ocrText]);

  const handleBack = () => {
    navigate('/add-material');
  };

  const handleContinue = () => {
    // Save current text and navigate to Step 3
    sessionStorage.setItem('ocrText', ocrText);
    navigate('/add-material?step=3');
  };

  const wordCount = ocrText.split(/\s+/).filter(Boolean).length;
  const charCount = ocrText.length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
          >
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
          {/* Section Header */}
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
            <ConfidenceBadge confidence={confidence} />
          </div>
          
          {/* Editable Textarea */}
          <div className="space-y-2">
            <Label htmlFor="ocr-text" className="sr-only">
              {t('material.ocrResult')}
            </Label>
            <Textarea
              id="ocr-text"
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder={MOCK_PLACEHOLDER}
              className="min-h-[400px] font-mono text-sm leading-relaxed resize-y"
              autoFocus
            />
          </div>
          
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
          disabled={ocrText.trim().length === 0}
          onClick={handleContinue}
        >
          <ArrowRight className="mr-2 h-5 w-5" />
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
