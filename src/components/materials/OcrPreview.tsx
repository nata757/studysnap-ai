import { useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfidenceBadge } from '@/components/ai/ConfidenceBadge';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';

interface OcrPreviewProps {
  text: string;
  confidence: 'high' | 'medium' | 'low';
  onTextChange: (text: string) => void;
}

const MOCK_PLACEHOLDER = `MOCK OCR: Paste your lecture text here. OCR will be enabled later.

---

MOCK OCR: Вставьте текст лекции здесь. OCR будет включён позже.`;

export function OcrPreview({ text, confidence, onTextChange }: OcrPreviewProps) {
  const { t } = useTranslation();

  // Prefill with mock text if empty
  useEffect(() => {
    if (!text || text.trim() === '') {
      onTextChange(MOCK_PLACEHOLDER);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
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
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={MOCK_PLACEHOLDER}
          className="min-h-[400px] font-mono text-sm leading-relaxed resize-y"
          autoFocus
        />
      </div>
      
      {/* Character count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{text.length} characters</span>
        <span>{text.split(/\s+/).filter(Boolean).length} words</span>
      </div>
    </div>
  );
}
