import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LogOut, Globe, BookOpen, Loader2 } from 'lucide-react';
import i18n from '@/i18n';

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isLoading: profileLoading } = useProfile();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
  };

  return (
    <AppLayout title={t('nav.profile')} showLogo={false}>
      <div className="space-y-6">
        {/* User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </CardContent>
        </Card>

        {/* Study Language Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" />
              {t('profile.studyLanguage')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('profile.studyLanguageDescription')}
            </p>
            {profileLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
              </div>
            ) : (
              <LanguageSwitcher size="default" />
            )}
          </CardContent>
        </Card>

        {/* UI Language Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5" />
              {t('profile.uiLanguage')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={i18n.language} onValueChange={handleLanguageChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Sign Out */}
        <Button variant="destructive" onClick={handleSignOut} className="w-full">
          <LogOut className="mr-2 h-4 w-4" />
          {t('auth.logout')}
        </Button>
      </div>
    </AppLayout>
  );
}
