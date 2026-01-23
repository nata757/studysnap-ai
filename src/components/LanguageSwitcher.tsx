import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { SupportedLanguage } from '@/lib/translations';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface LanguageSwitcherProps {
  type: 'study' | 'ui' | 'global';
  size?: 'sm' | 'default';
}

export function LanguageSwitcher({ type, size = 'sm' }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const { profile, isLoading, updateStudyLanguage, updateUiLanguage } = useProfile();

  // For global mode, show study language as the active selection
  const currentLang = type === 'ui' 
    ? profile?.ui_language 
    : profile?.preferred_study_language;

  const handleChange = async (lang: SupportedLanguage) => {
    if (lang === currentLang) return;
    
    if (type === 'global') {
      // Update both languages together
      const [studySuccess, uiSuccess] = await Promise.all([
        updateStudyLanguage(lang),
        updateUiLanguage(lang),
      ]);
      
      if (studySuccess && uiSuccess) {
        toast.success(t('profile.languageSaved'));
      } else {
        toast.error(t('profile.saveFailed'));
      }
    } else {
      const updateFn = type === 'study' ? updateStudyLanguage : updateUiLanguage;
      const success = await updateFn(lang);
      
      if (success) {
        toast.success(type === 'study' 
          ? t('profile.studyLanguageSaved') 
          : t('profile.uiLanguageSaved')
        );
      } else {
        toast.error(t('profile.saveFailed'));
      }
    }
  };

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="flex gap-1">
      {(['ru', 'de', 'en'] as const).map((lang) => (
        <Button
          key={lang}
          variant={currentLang === lang ? 'default' : 'ghost'}
          size={size}
          onClick={() => handleChange(lang)}
          className="uppercase px-2 text-xs font-medium"
        >
          {lang}
        </Button>
      ))}
    </div>
  );
}
