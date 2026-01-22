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

// Initialize draft from sessionStorage or use placeholder
function getInitialDraft(): string {
  if (typeof window === 'undefined') return PLACEHOLDER_TEXT;
  
  const savedDraft = sessionStorage.getItem('lectureTextDraft');
  if (savedDraft) return savedDraft;
  
  const savedOcrText = sessionStorage.getItem('lectureText');
  if (savedOcrText) return savedOcrText;
  
  return PLACEHOLDER_TEXT;
}

export default function ReviewText() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Single state for the user's draft - initialized ONCE, never auto-updated
  const [lectureTextDraft, setLectureTextDraft] = useState<string>(getInitialDraft);

  // Simple onChange handler - no side effects, no auto-sync
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLectureTextDraft(value);
    // Save to sessionStorage for persistence
    sessionStorage.setItem('lectureTextDraft', value);
  };

  const handleBack = () => {
    navigate('/add-material');
  };

  const handleContinue = () => {
    if (lectureTextDraft.trim().length === 0) {
      toast.error('Please enter some text');
      return;
    }
    sessionStorage.setItem('lectureText', lectureTextDraft);
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
                {t('material.editText')}
              </p>
            </div>
          </div>
          
          {/* Pure textarea - no auto-updates, no effects, fully editable */}
          <Textarea
            value={lectureTextDraft}
            onChange={handleChange}
            placeholder={PLACEHOLDER_TEXT}
            className="min-h-[400px] font-mono text-sm leading-relaxed resize-y"
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
