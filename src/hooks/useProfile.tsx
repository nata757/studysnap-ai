import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SupportedLanguage } from '@/lib/translations';
import i18n from '@/i18n';

export interface UserProfile {
  id: string;
  preferred_study_language: SupportedLanguage;
  ui_language: SupportedLanguage;
  exam_date: string | null;
  created_at: string | null;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchError) {
        console.error('Failed to fetch profile:', fetchError);
        setError('Failed to load profile');
        return;
      }

      if (data) {
        const userProfile: UserProfile = {
          id: data.id,
          preferred_study_language: (data.preferred_study_language as SupportedLanguage) || 'ru',
          ui_language: (data.ui_language as SupportedLanguage) || 'ru',
          exam_date: data.exam_date,
          created_at: data.created_at,
        };
        setProfile(userProfile);
        
        // Sync i18n with user's UI language preference
        if (userProfile.ui_language && userProfile.ui_language !== i18n.language) {
          i18n.changeLanguage(userProfile.ui_language);
        }
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateStudyLanguage = useCallback(async (language: SupportedLanguage): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ preferred_study_language: language })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update study language:', updateError);
        return false;
      }

      setProfile(prev => prev ? { ...prev, preferred_study_language: language } : null);
      return true;
    } catch (err) {
      console.error('Update study language error:', err);
      return false;
    }
  }, [user]);

  const updateUiLanguage = useCallback(async (language: SupportedLanguage): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ ui_language: language })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update UI language:', updateError);
        return false;
      }

      setProfile(prev => prev ? { ...prev, ui_language: language } : null);
      i18n.changeLanguage(language);
      localStorage.setItem('i18nextLng', language);
      return true;
    } catch (err) {
      console.error('Update UI language error:', err);
      return false;
    }
  }, [user]);

  return {
    profile,
    isLoading,
    error,
    updateStudyLanguage,
    updateUiLanguage,
    refetch: fetchProfile,
  };
}
