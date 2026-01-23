import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { LogOut, Globe, BookOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { SupportedLanguage, LANGUAGE_NAMES } from '@/lib/translations';

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, isLoading: profileLoading, updateStudyLanguage } = useProfile();
  
  const [studyLanguage, setStudyLanguage] = useState<SupportedLanguage>('ru');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync study language from profile
  useEffect(() => {
    if (profile) {
      setStudyLanguage(profile.language);
    }
  }, [profile]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
  };

  const handleStudyLanguageChange = (lang: SupportedLanguage) => {
    setStudyLanguage(lang);
    setHasChanges(lang !== profile?.language);
  };

  const handleSaveStudyLanguage = async () => {
    setIsSaving(true);
    const success = await updateStudyLanguage(studyLanguage);
    setIsSaving(false);
    
    if (success) {
      setHasChanges(false);
      toast.success(t('profile.studyLanguageSaved') || 'Study language saved');
    } else {
      toast.error(t('profile.saveFailed') || 'Failed to save');
    }
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
              {t('profile.studyLanguage') || 'Study Language'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('profile.studyLanguageDescription') || 'Default language for viewing study materials and translations.'}
            </p>
            {profileLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <div className="flex gap-2">
                {(['ru', 'de', 'en'] as const).map((lang) => (
                  <Button
                    key={lang}
                    variant={studyLanguage === lang ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleStudyLanguageChange(lang)}
                    className="uppercase"
                  >
                    {lang}
                  </Button>
                ))}
              </div>
            )}
            {hasChanges && (
              <Button 
                onClick={handleSaveStudyLanguage} 
                disabled={isSaving}
                className="w-full"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.saving') || 'Saving...'}
                  </>
                ) : (
                  t('common.save') || 'Save'
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* UI Language Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5" />
              {t('profile.uiLanguage') || 'Interface Language'}
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
