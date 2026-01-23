import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  parseI18nData,
  serializeI18nData,
  createI18nData,
  setVersion,
  getTextInLanguage,
  SupportedLanguage,
  LANGUAGE_NAMES,
} from '@/lib/translations';
import { Bug, Database, Globe, Trash2, Plus, Languages, RefreshCw } from 'lucide-react';

interface Material {
  id: string;
  title: string | null;
  topic: string;
  notes: string | null;
  ocr_text: string | null;
  created_at: string;
}

interface LogEntry {
  time: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

export default function Debug() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile, updateStudyLanguage } = useProfile();
  
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ time, type, message }, ...prev].slice(0, 50));
  }, []);

  const currentLang = (profile?.preferred_study_language || 'ru') as SupportedLanguage;

  // Load materials
  const loadMaterials = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    addLog('info', 'Loading materials...');
    
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('id, title, topic, notes, ocr_text, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setMaterials(data || []);
      addLog('success', `Loaded ${data?.length || 0} materials`);
    } catch (err) {
      addLog('error', `Failed to load: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [user, addLog]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  // Handle language switch
  const handleLanguageSwitch = async (lang: SupportedLanguage) => {
    addLog('info', `Switching language to ${lang}...`);
    const success = await updateStudyLanguage(lang);
    if (success) {
      addLog('success', `Language switched to ${LANGUAGE_NAMES[lang]}`);
    } else {
      addLog('error', 'Failed to switch language');
    }
  };

  // Create debug material
  const createDebugMaterial = async () => {
    if (!user) return;
    
    addLog('info', 'Creating DEBUG material...');
    
    try {
      const testText = {
        ru: 'Это тестовый материал для отладки. Анатомия человека включает изучение костей, мышц и органов.',
        de: 'Dies ist ein Test-Material zum Debuggen. Die menschliche Anatomie umfasst das Studium von Knochen, Muskeln und Organen.',
        en: 'This is a test material for debugging. Human anatomy includes the study of bones, muscles, and organs.',
      };

      const sourceLang = currentLang;
      const i18nData = createI18nData(testText[sourceLang], sourceLang);

      const { data, error } = await supabase
        .from('materials')
        .insert({
          user_id: user.id,
          title: `DEBUG Test Material ${Date.now()}`,
          topic: 'Anatomie',
          ocr_text: testText[sourceLang],
          notes: serializeI18nData(i18nData),
        })
        .select()
        .single();

      if (error) throw error;

      addLog('success', `Created DEBUG material: ${data.id}`);
      loadMaterials();
    } catch (err) {
      addLog('error', `Failed to create: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Generate mock translation
  const generateMockTranslation = async () => {
    if (!selectedMaterial) {
      addLog('warn', 'No material selected');
      return;
    }

    addLog('info', `Generating mock translation for ${currentLang}...`);

    try {
      let i18nData = parseI18nData(selectedMaterial.notes);
      
      if (!i18nData) {
        // Create new i18n structure from ocr_text
        const sourceText = selectedMaterial.ocr_text || 'No text available';
        i18nData = createI18nData(sourceText, currentLang);
        addLog('info', 'Created new i18n structure');
      }

      // Generate mock translation
      const sourceText = getTextInLanguage(i18nData, i18nData.sourceLanguage);
      const mockTranslation = `[MOCK ${currentLang.toUpperCase()}] ${sourceText.substring(0, 100)}...`;
      
      i18nData = setVersion(i18nData, currentLang, mockTranslation, false);

      const { error } = await supabase
        .from('materials')
        .update({ notes: serializeI18nData(i18nData) })
        .eq('id', selectedMaterial.id);

      if (error) throw error;

      addLog('success', `Mock translation saved for ${currentLang}`);
      
      // Refresh selected material
      setSelectedMaterial({ ...selectedMaterial, notes: serializeI18nData(i18nData) });
      loadMaterials();
    } catch (err) {
      addLog('error', `Failed to generate: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Delete debug material
  const deleteDebugMaterial = async () => {
    if (!selectedMaterial) {
      addLog('warn', 'No material selected');
      return;
    }

    if (!selectedMaterial.title?.includes('DEBUG')) {
      addLog('error', 'Can only delete materials with DEBUG in title');
      return;
    }

    addLog('info', `Deleting DEBUG material: ${selectedMaterial.id}...`);

    try {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', selectedMaterial.id);

      if (error) throw error;

      addLog('success', 'DEBUG material deleted');
      setSelectedMaterial(null);
      loadMaterials();
    } catch (err) {
      addLog('error', `Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const i18nData = selectedMaterial ? parseI18nData(selectedMaterial.notes) : null;

  return (
    <AppLayout title="Debug" showNav={false}>
      <div className="space-y-4">
        {/* Header */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bug className="h-5 w-5" />
              Debug Panel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Language */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Current Language:</span>
                <Badge variant="secondary">{LANGUAGE_NAMES[currentLang]}</Badge>
              </div>
            </div>
            
            {/* Language Switcher */}
            <div className="flex gap-2">
              {(['ru', 'de', 'en'] as SupportedLanguage[]).map((lang) => (
                <Button
                  key={lang}
                  variant={currentLang === lang ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleLanguageSwitch(lang)}
                >
                  {lang.toUpperCase()}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Materials List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5" />
                Materials ({materials.length})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={loadMaterials} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedMaterial?.id || ''}
              onValueChange={(id) => {
                const mat = materials.find(m => m.id === id);
                setSelectedMaterial(mat || null);
                if (mat) addLog('info', `Selected: ${mat.title || mat.id}`);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a material..." />
              </SelectTrigger>
              <SelectContent>
                {materials.map((mat) => (
                  <SelectItem key={mat.id} value={mat.id}>
                    <span className={mat.title?.includes('DEBUG') ? 'text-orange-500' : ''}>
                      {mat.title || `Untitled (${mat.topic})`}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Selected Material Details */}
        {selectedMaterial && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Languages className="h-5 w-5" />
                i18n Structure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Source Language:</span>
                  <Badge variant="outline" className="ml-2">
                    {i18nData?.sourceLanguage?.toUpperCase() || 'N/A'}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Versions:</span>
                  <span className="ml-2">
                    {i18nData ? Object.keys(i18nData.versions).join(', ').toUpperCase() : 'None'}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Text for current language */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-medium">Text for {currentLang.toUpperCase()}:</span>
                  {i18nData?.versions[currentLang]?.isManual && (
                    <Badge variant="secondary" className="text-xs">Manual</Badge>
                  )}
                </div>
                <div className="rounded-md bg-muted p-3 text-sm">
                  {i18nData ? getTextInLanguage(i18nData, currentLang).substring(0, 300) : 'No i18n data'}
                  {(getTextInLanguage(i18nData, currentLang)?.length || 0) > 300 && '...'}
                </div>
              </div>

              <Separator />

              {/* Raw JSON */}
              <div>
                <span className="mb-2 block text-sm font-medium">Raw notes.i18n JSON:</span>
                <ScrollArea className="h-40 rounded-md border bg-muted/50 p-3">
                  <pre className="text-xs">
                    {i18nData ? JSON.stringify(i18nData, null, 2) : 'null (no i18n structure)'}
                  </pre>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={createDebugMaterial} className="w-full" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Create DEBUG Mock Material
            </Button>
            <Button
              onClick={generateMockTranslation}
              className="w-full"
              variant="outline"
              disabled={!selectedMaterial}
            >
              <Languages className="mr-2 h-4 w-4" />
              Generate Mock Translation ({currentLang.toUpperCase()})
            </Button>
            <Button
              onClick={deleteDebugMaterial}
              className="w-full"
              variant="destructive"
              disabled={!selectedMaterial || !selectedMaterial.title?.includes('DEBUG')}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected DEBUG Material
            </Button>
          </CardContent>
        </Card>

        {/* Log Panel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Log</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48 rounded-md border bg-muted/50 p-2">
              {logs.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">No logs yet</p>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="text-muted-foreground">{log.time}</span>
                      <span
                        className={
                          log.type === 'error'
                            ? 'text-destructive'
                            : log.type === 'success'
                            ? 'text-green-600'
                            : log.type === 'warn'
                            ? 'text-yellow-600'
                            : 'text-foreground'
                        }
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
