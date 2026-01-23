import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { TOPICS, Topic, PhotoData } from '@/lib/types';
import { uploadPhoto, createDraftMaterial } from '@/lib/storage';
import { 
  createI18nData, 
  serializeI18nData, 
  detectSourceLanguage 
} from '@/lib/translations';
import { toast } from 'sonner';

export default function MaterialDetails() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState<Topic | ''>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load data from sessionStorage on mount
  useEffect(() => {
    const savedTitle = sessionStorage.getItem('materialTitle');
    const savedTopic = sessionStorage.getItem('materialTopic');
    const savedTags = sessionStorage.getItem('materialTags');
    
    if (savedTitle) setTitle(savedTitle);
    if (savedTopic) setTopic(savedTopic as Topic);
    if (savedTags) setTags(JSON.parse(savedTags));
  }, []);

  const handleBack = () => {
    // Save current state before going back
    sessionStorage.setItem('materialTitle', title);
    sessionStorage.setItem('materialTopic', topic);
    sessionStorage.setItem('materialTags', JSON.stringify(tags));
    navigate('/review-text');
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    if (!user) {
      toast.error('Please log in to save');
      return;
    }

    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!topic) {
      toast.error('Please select a topic');
      return;
    }

    setIsSaving(true);

    try {
      // Get data from sessionStorage
      const lectureText = sessionStorage.getItem('lectureText') || '';
      const imagesJson = sessionStorage.getItem('materialImages');
      const images: string[] = imagesJson ? JSON.parse(imagesJson) : [];
      
      // Get detected language from OCR (or detect from text as fallback)
      const savedLanguage = sessionStorage.getItem('detectedLanguage');
      const sourceLanguage = (savedLanguage as 'ru' | 'de' | 'en') || detectSourceLanguage(lectureText);

      // Create draft material first to get materialId
      const materialId = await createDraftMaterial(user.id, topic);
      if (!materialId) {
        toast.error('Failed to create material');
        setIsSaving(false);
        return;
      }

      // Upload images with proper path structure
      const photos: PhotoData[] = [];
      
      for (const base64Image of images) {
        const photoData = await uploadPhoto(base64Image, user.id, materialId);
        if (photoData) {
          photos.push(photoData);
        }
      }

      // Create i18n data structure with detected/saved language
      const i18nData = createI18nData(lectureText, sourceLanguage);
      const notes = serializeI18nData(i18nData);

      // Update material with all data
      const { error: updateError } = await supabase
        .from('materials')
        .update({
          title: title.trim(),
          topic,
          tags: tags.length > 0 ? tags : null,
          ocr_text: lectureText,
          notes, // Store translation data as JSON
          images: photos.map(p => p.url), // Keep legacy images array for compatibility
          photos, // New structure with paths
        })
        .eq('id', materialId);

      if (updateError) {
        console.error('Database error:', updateError);
        toast.error('Failed to save material. Please try again.');
        return;
      }

      // Clear sessionStorage after successful save
      sessionStorage.removeItem('lectureText');
      sessionStorage.removeItem('ocrConfidence');
      sessionStorage.removeItem('materialImages');
      sessionStorage.removeItem('materialTitle');
      sessionStorage.removeItem('materialTopic');
      sessionStorage.removeItem('materialTags');
      sessionStorage.removeItem('pendingOcr');
      sessionStorage.removeItem('detectedLanguage');

      toast.success('Material saved successfully!');
      
      // Navigate to the new material
      navigate(`/lecture/${materialId}`, { replace: true });
    } catch (err) {
      console.error('Save error:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = title.trim().length > 0 && topic !== '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold">{t('material.add')}</h1>
            <p className="text-xs text-muted-foreground">
              {t('common.step')} 3 / 3
            </p>
          </div>
        </div>
        <Progress value={100} className="mt-2 h-1" />
      </header>

      {/* Content */}
      <main className="flex-1 p-4 pb-24 space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">
            {t('material.title')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Anatomy Lecture 5"
            autoFocus
          />
        </div>

        {/* Topic */}
        <div className="space-y-2">
          <Label htmlFor="topic">
            {t('material.topic')} <span className="text-destructive">*</span>
          </Label>
          <Select value={topic} onValueChange={(v) => setTopic(v as Topic)}>
            <SelectTrigger id="topic">
              <SelectValue placeholder={t('material.selectTopic')} />
            </SelectTrigger>
            <SelectContent>
              {TOPICS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label htmlFor="tags">{t('material.tags')}</Label>
          <div className="flex gap-2">
            <Input
              id="tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a tag and press Enter"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleAddTag}
              disabled={!tagInput.trim()}
            >
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
        <Button
          className="w-full"
          size="lg"
          disabled={!canSave || isSaving}
          onClick={handleSave}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-5 w-5" />
              {t('common.save')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}