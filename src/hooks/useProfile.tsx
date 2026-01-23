import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SupportedLanguage } from '@/lib/translations';

export interface UserProfile {
  id: string;
  language: SupportedLanguage;
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
        setProfile({
          id: data.id,
          language: (data.language as SupportedLanguage) || 'ru',
          exam_date: data.exam_date,
          created_at: data.created_at,
        });
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
        .update({ language })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update language:', updateError);
        return false;
      }

      setProfile(prev => prev ? { ...prev, language } : null);
      return true;
    } catch (err) {
      console.error('Update language error:', err);
      return false;
    }
  }, [user]);

  return {
    profile,
    isLoading,
    error,
    updateStudyLanguage,
    refetch: fetchProfile,
  };
}
