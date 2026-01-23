import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface HeaderProps {
  title?: string;
  showLogo?: boolean;
  showLanguageSwitcher?: boolean;
}

export function Header({ title, showLogo = true, showLanguageSwitcher = false }: HeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        {showLogo ? (
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">{t('home.title')}</span>
          </div>
        ) : (
          <h1 className="text-lg font-semibold">{title}</h1>
        )}
        
        {showLanguageSwitcher && <LanguageSwitcher type="global" />}
      </div>
    </header>
  );
}
