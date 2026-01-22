import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

const PLACEHOLDER_TEXT = `Paste your lecture text here.

---

Вставьте текст лекции здесь.`;

export default function ReviewText() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Simple state - initialized once, never auto-updated
  const [lectureText, setLectureText] = useState<string>(() => {
    if (typeof window === 'undefined') return PLACEHOLDER_TEXT;
    return sessionStorage.getItem('lectureText') || PLACEHOLDER_TEXT;
  });

  const handleBack = () => {
    navigate('/add-material');
  };

  const handleContinue = () => {
    if (lectureText.trim().length === 0) {
      toast.error('Please enter some text');
      return;
    }
    sessionStorage.setItem('lectureText', lectureText);
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
                {t('material.editText')}
              </p>
            </div>
          </div>
          
          {/* Simple editable textarea */}
          <Textarea
            value={lectureText}
            onChange={(e) => setLectureText(e.target.value)}
            placeholder={PLACEHOLDER_TEXT}
            className="min-h-[400px] font-mono text-sm leading-relaxed resize-y"
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
