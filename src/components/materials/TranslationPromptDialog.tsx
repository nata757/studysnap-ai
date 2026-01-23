import { useTranslation } from 'react-i18next';
import { Loader2, Languages } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LANGUAGE_NAMES, SupportedLanguage } from '@/lib/translations';

interface TranslationPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetLanguage: SupportedLanguage;
  isTranslating: boolean;
  onTranslateAndContinue: () => void;
  onUseSource: () => void;
}

export function TranslationPromptDialog({
  open,
  onOpenChange,
  targetLanguage,
  isTranslating,
  onTranslateAndContinue,
  onUseSource,
}: TranslationPromptDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            {t('ai.noTranslationTitle') || 'No Translation Available'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('ai.noTranslationDescription', { language: LANGUAGE_NAMES[targetLanguage] }) || 
              `The text hasn't been translated to ${LANGUAGE_NAMES[targetLanguage]} yet. Would you like to translate it first?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel 
            onClick={onUseSource}
            disabled={isTranslating}
          >
            {t('ai.useSource') || 'Use Source Text'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onTranslateAndContinue}
            disabled={isTranslating}
          >
            {isTranslating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('ai.translating') || 'Translating...'}
              </>
            ) : (
              t('ai.translateAndContinue') || 'Translate & Continue'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
