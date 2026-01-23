import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { SupportedLanguage } from '@/lib/translations';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface LanguageSwitcherProps {
  size?: 'sm' | 'default';
  showLabels?: boolean;
}

export function LanguageSwitcher({ size = 'sm', showLabels = false }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const { profile, isLoading, updateStudyLanguage } = useProfile();

  const handleChange = async (lang: SupportedLanguage) => {
    if (lang === profile?.language) return;
    
    const success = await updateStudyLanguage(lang);
    if (success) {
      toast.success(t('profile.studyLanguageSaved'));
    } else {
      toast.error(t('profile.saveFailed'));
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
          variant={profile?.language === lang ? 'default' : 'ghost'}
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
