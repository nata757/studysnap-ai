import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfidenceBadge } from '@/components/ai/ConfidenceBadge';
import { useTranslation } from 'react-i18next';

interface OcrPreviewProps {
  text: string;
  confidence: 'high' | 'medium' | 'low';
  onTextChange: (text: string) => void;
}

export function OcrPreview({ text, confidence, onTextChange }: OcrPreviewProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="ocr-text">{t('material.ocrResult')}</Label>
        <ConfidenceBadge confidence={confidence} />
      </div>
      
      <Textarea
        id="ocr-text"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={t('material.editText')}
        className="min-h-[300px] font-mono text-sm"
      />
      
      <p className="text-xs text-muted-foreground">
        {t('material.editText')} - {text.length} символов
      </p>
    </div>
  );
}
