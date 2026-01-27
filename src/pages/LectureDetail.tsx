import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, Image, Calendar, Tag, Loader2, Pencil, Trash2, X, Save, MoreVertical, Plus, Sparkles, BookOpen, HelpCircle, Info } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ImageLightbox } from '@/components/materials/ImageLightbox';
import { TranslationPromptDialog } from '@/components/materials/TranslationPromptDialog';
import { TOPICS } from '@/lib/constants';
import { Topic, PhotoData } from '@/lib/types';
import { deletePhoto, deletePhotosWithResults, uploadPhoto } from '@/lib/storage';
import { 
  parseTranslationData, 
  serializeTranslationData, 
  TranslationData, 
  SupportedLanguage,
  getTextInLanguage,
  getTitleInLanguage,
  hasTranslation,
  getAvailableLanguages,
  LANGUAGE_NAMES,
  LANGUAGE_CODES,
  setTranslation,
  setVersion,
  setTitle,
  setFullVersion,
  createTranslationData,
  detectSourceLanguage,
  isVersionManual
} from '@/lib/translations';

interface Material {
  id: string;
  title: string | null;
  topic: string;
  tags: string[] | null;
  ocr_text: string | null;
  notes: string | null; // Stores translation data as JSON
  images: string[] | null; // Legacy
  photos: PhotoData[] | null; // New structure
  created_at: string | null;
}

interface Summary {
  id: string;
  material_id: string;
  short_summary: string | null;
  medium_summary: string | null;
  long_summary: string | null;
  warnings: string[];
  generated_at: string;
}

interface Flashcard {
  id: string;
  material_id: string;
  question: string;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  stage: number;
  due_date: string;
  created_at: string;
}

interface QuizQuestion {
  id: string;
  material_id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  confidence: 'high' | 'medium' | 'low';
  created_at: string;
}

interface EditForm {
  title: string;
  topic: Topic;
  tags: string;
  ocr_text: string;
  photos: PhotoData[];
}

type SummaryLevel = 'short' | 'medium' | 'long';

export default function LectureDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [material, setMaterial] = useState<Material | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    title: '',
    topic: 'Sonstiges',
    tags: '',
    ocr_text: '',
    photos: [],
  });
  
  // Separate draft state for text to prevent cursor jumping
  const [textDraft, setTextDraft] = useState('');
  
  // Photo deletion state
  const [deletePhotoIndex, setDeletePhotoIndex] = useState<number | null>(null);
  
  // Photo upload state
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  
  // Material deletion state
  const [showDeleteMaterial, setShowDeleteMaterial] = useState(false);
  const [isDeletingMaterial, setIsDeletingMaterial] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);

  // Summary state
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLevel, setSummaryLevel] = useState<SummaryLevel>('short');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Flashcards state
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [flashcardWarnings, setFlashcardWarnings] = useState<string[]>([]);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizWarnings, setQuizWarnings] = useState<string[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number | null>>({});
  const [showQuizResults, setShowQuizResults] = useState(false);

  // Translation state
  const [translationData, setTranslationData] = useState<TranslationData | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Local view language for Text tab only (does NOT affect global study language)
  const [viewLanguage, setViewLanguage] = useState<SupportedLanguage>('ru');
  const [viewLanguageInitialized, setViewLanguageInitialized] = useState(false);

  // Translation prompt dialog state
  const [showTranslationPrompt, setShowTranslationPrompt] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<'summary' | 'flashcards' | 'quiz' | null>(null);

  // Global study language from profile (used for AI content)
  const studyLanguage = profile?.preferred_study_language || 'ru';

  // Initialize view language from profile once
  useEffect(() => {
    if (profile && !viewLanguageInitialized) {
      setViewLanguage(profile.preferred_study_language);
      setViewLanguageInitialized(true);
    }
  }, [profile, viewLanguageInitialized]);

  // Helper to get text for AI based on GLOBAL study language
  const getTextForAi = (): string | null => {
    if (!translationData) {
      return material?.ocr_text || null;
    }
    
    // Check if translation exists for study language
    if (hasTranslation(translationData, studyLanguage)) {
      return getTextInLanguage(translationData, studyLanguage);
    }
    
    // Fallback to source text
    return getTextInLanguage(translationData, translationData.sourceLanguage) || material?.ocr_text || null;
  };

  // Check if we need to prompt for translation before AI generation
  const checkTranslationBeforeAi = (action: 'summary' | 'flashcards' | 'quiz'): boolean => {
    if (!translationData) return true; // No translation data, proceed with source
    
    // If study language has translation or is source, proceed
    if (hasTranslation(translationData, studyLanguage)) {
      return true;
    }
    
    // Need to prompt user
    setPendingAiAction(action);
    setShowTranslationPrompt(true);
    return false;
  };

  // Handle "Use Source" from translation prompt
  const handleUseSourceForAi = () => {
    setShowTranslationPrompt(false);
    const action = pendingAiAction;
    setPendingAiAction(null);
    
    if (action === 'summary') executeGenerateSummary();
    else if (action === 'flashcards') executeGenerateFlashcards();
    else if (action === 'quiz') executeGenerateQuiz();
  };

  // Handle "Translate & Continue" from translation prompt
  const handleTranslateAndContinue = async () => {
    const action = pendingAiAction;
    
    // Translate first
    await handleTranslate(studyLanguage);
    
    setShowTranslationPrompt(false);
    setPendingAiAction(null);
    
    // Then run the AI action
    if (action === 'summary') executeGenerateSummary();
    else if (action === 'flashcards') executeGenerateFlashcards();
    else if (action === 'quiz') executeGenerateQuiz();
  };

  const openLightbox = (index: number) => {
    if (isEditing) return; // Don't open lightbox in edit mode
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Helper to get photos from material (handles legacy images array)
  const getMaterialPhotos = (mat: Material): PhotoData[] => {
    // Prefer new photos array, fallback to converting legacy images
    if (mat.photos && mat.photos.length > 0) {
      return mat.photos;
    }
    if (mat.images && mat.images.length > 0) {
      return mat.images.map(url => ({
        url,
        path: null, // Legacy - no path stored
        createdAt: mat.created_at || new Date().toISOString(),
      }));
    }
    return [];
  };

  // Initialize edit form from material - textDraft is set ONCE here
  const startEditing = () => {
    if (!material) return;
    const photos = getMaterialPhotos(material);
    setEditForm({
      title: material.title || '',
      topic: (material.topic as Topic) || 'Sonstiges',
      tags: material.tags?.join(', ') || '',
      ocr_text: material.ocr_text || '',
      photos,
    });
    // Initialize textDraft once from material
    setTextDraft(material.ocr_text || '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    // Reset form and textDraft to original values
    if (material) {
      const photos = getMaterialPhotos(material);
      setEditForm({
        title: material.title || '',
        topic: (material.topic as Topic) || 'Sonstiges',
        tags: material.tags?.join(', ') || '',
        ocr_text: material.ocr_text || '',
        photos,
      });
      setTextDraft(material.ocr_text || '');
    }
  };

  // Extract storage path from URL for deletion
  const extractStoragePath = (url: string): string | null => {
    try {
      // URL format: .../storage/v1/object/public/materials/user_id/filename
      const match = url.match(/\/materials\/(.+)$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  const handleDeletePhoto = async () => {
    if (deletePhotoIndex === null || !material || !id) return;
    
    const photo = editForm.photos[deletePhotoIndex];
    if (!photo) return;

    setIsDeletingPhoto(true);
    try {
      const isLegacyPhoto = !photo.path;

      // If photo has a path, try to delete from storage FIRST
      if (!isLegacyPhoto) {
        const storageDeleted = await deletePhoto(photo.path!);
        
        if (!storageDeleted) {
          toast.error('Could not delete from storage. Try again.');
          setIsDeletingPhoto(false);
          setDeletePhotoIndex(null);
          return;
        }
      }

      // Storage deletion succeeded (or legacy photo) - now update database
      const updatedPhotos = editForm.photos.filter((_, idx) => idx !== deletePhotoIndex);

      const { error: updateError } = await supabase
        .from('materials')
        .update({ 
          photos: updatedPhotos,
          images: updatedPhotos.map(p => p.url), // Keep legacy in sync
        })
        .eq('id', id);

      if (updateError) {
        console.error('Failed to update photos in database:', updateError);
        toast.error('Failed to update material record');
        return;
      }

      // Update local state
      setEditForm((prev) => ({ ...prev, photos: updatedPhotos }));
      setMaterial((prev) => prev ? { 
        ...prev, 
        photos: updatedPhotos,
        images: updatedPhotos.map(p => p.url),
      } : null);
      
      // Show appropriate message
      if (isLegacyPhoto) {
        toast.warning('Removed from material, but storage cleanup not available for legacy photos.');
      } else {
        toast.success('Photo deleted');
      }
    } catch (err) {
      console.error('Delete photo error:', err);
      toast.error('Failed to delete photo');
    } finally {
      setIsDeletingPhoto(false);
      setDeletePhotoIndex(null);
    }
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle adding new photos in edit mode
  const handleAddPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user || !id) return;

    setIsUploadingPhotos(true);
    const newPhotos: PhotoData[] = [];
    let failedCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) {
          failedCount++;
          continue;
        }

        // Convert to base64 and upload
        const base64 = await fileToBase64(file);
        const photoData = await uploadPhoto(base64, user.id, id);
        
        if (photoData) {
          newPhotos.push(photoData);
        } else {
          failedCount++;
        }
      }

      if (newPhotos.length > 0) {
        // Append new photos to editForm
        setEditForm(prev => ({
          ...prev,
          photos: [...prev.photos, ...newPhotos],
        }));
        toast.success(`${newPhotos.length} photo(s) added`);
      }

      if (failedCount > 0) {
        toast.warning(`${failedCount} photo(s) failed to upload`);
      }
    } catch (err) {
      console.error('Add photos error:', err);
      toast.error('Failed to add photos');
    } finally {
      setIsUploadingPhotos(false);
      // Reset input
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleSave = async () => {
    if (!material || !id) return;

    setIsSaving(true);
    try {
      // Parse tags from comma-separated string
      const tagsArray = editForm.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      // Check if text was edited - if so, update i18n data
      let updatedNotes = material.notes;
      let updatedTranslationData = translationData;
      
      if (textDraft !== material.ocr_text) {
        // Text was changed - update the version for current view language as manual
        if (translationData) {
          updatedTranslationData = setVersion(translationData, viewLanguage, textDraft, true);
          updatedNotes = serializeTranslationData(updatedTranslationData);
        } else {
          // Create new translation data
          const sourceLanguage = detectSourceLanguage(textDraft);
          updatedTranslationData = createTranslationData(textDraft, sourceLanguage);
          updatedNotes = serializeTranslationData(updatedTranslationData);
        }
      }

      const { error: updateError } = await supabase
        .from('materials')
        .update({
          title: editForm.title || null,
          topic: editForm.topic,
          tags: tagsArray,
          ocr_text: textDraft || null,
          notes: updatedNotes,
          photos: editForm.photos,
          images: editForm.photos.map(p => p.url), // Keep legacy in sync
        })
        .eq('id', id);

      if (updateError) {
        console.error('Update error:', updateError);
        toast.error('Failed to save changes');
        return;
      }

      // Update local state with textDraft and updated translation data
      setMaterial({
        ...material,
        title: editForm.title || null,
        topic: editForm.topic,
        tags: tagsArray,
        ocr_text: textDraft || null,
        notes: updatedNotes,
        photos: editForm.photos,
        images: editForm.photos.map(p => p.url),
      });
      
      if (updatedTranslationData) {
        setTranslationData(updatedTranslationData);
      }

      setIsEditing(false);
      toast.success('Changes saved successfully!');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!material || !id) return;

    setIsDeletingMaterial(true);
    try {
      // Get photos with valid paths for storage deletion
      const photos = getMaterialPhotos(material);
      const photosWithPaths = photos.filter(p => p.path !== null);
      const storagePaths = photosWithPaths.map(p => p.path!);
      
      // Track storage deletion failures
      let failedStorageCount = 0;
      const failedPaths: string[] = [];

      // Delete photos from storage first (only those with paths)
      if (storagePaths.length > 0) {
        const { failed } = await deletePhotosWithResults(storagePaths);
        failedStorageCount = failed.length;
        failedPaths.push(...failed);
        
        // Log failed paths for later cleanup
        if (failed.length > 0) {
          console.warn('Failed to delete these storage paths (orphaned files):', failed);
        }
      }

      // Delete related records (flashcards, quiz_questions, summaries)
      await Promise.all([
        supabase.from('flashcards').delete().eq('material_id', id),
        supabase.from('quiz_questions').delete().eq('material_id', id),
        supabase.from('summaries').delete().eq('material_id', id),
      ]);

      // Delete the material record
      const { error: deleteError } = await supabase
        .from('materials')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('Delete material error:', deleteError);
        toast.error('Failed to delete material');
        return;
      }

      // Show appropriate toast
      if (failedStorageCount > 0) {
        toast.warning(`Material deleted, but ${failedStorageCount} file(s) could not be removed from storage.`);
      } else {
        toast.success('Material deleted');
      }
      
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Delete material error:', err);
      toast.error('Failed to delete material');
    } finally {
      setIsDeletingMaterial(false);
      setShowDeleteMaterial(false);
    }
  };

  // Fetch existing summary for current language
  const fetchSummary = async (lang: SupportedLanguage) => {
    if (!id) return;
    
    const { data } = await supabase
      .from('summaries')
      .select('*')
      .eq('material_id', id)
      .eq('language', lang)
      .maybeSingle();
    
    setSummary(data || null);
  };

  // Fetch existing flashcards for current language
  const fetchFlashcards = async (lang: SupportedLanguage) => {
    if (!id) return;
    
    const { data } = await supabase
      .from('flashcards')
      .select('*')
      .eq('material_id', id)
      .eq('language', lang)
      .order('created_at', { ascending: true });
    
    setFlashcards((data || []) as Flashcard[]);
  };

  // Fetch existing quiz questions for current language
  const fetchQuizQuestions = async (lang: SupportedLanguage) => {
    if (!id) return;
    
    // Clear previous quiz data immediately to prevent showing wrong language
    setQuizQuestions([]);
    setQuizAnswers({});
    setShowQuizResults(false);
    
    const { data, error } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('material_id', id)
      .eq('language', lang)
      .order('created_at', { ascending: false });
    
    // Debug logging
    console.log(`[Quiz] Fetching for lang=${lang}, got ${data?.length ?? 0} questions`, 
      data?.map(q => ({ id: q.id, lang: q.language })));
    
    if (error) {
      console.error('[Quiz] Fetch error:', error);
      return;
    }
    
    if (data && data.length > 0) {
      // Parse options from JSON if needed
      const parsed = data.map(q => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : JSON.parse(q.options as string),
      })) as QuizQuestion[];
      setQuizQuestions(parsed);
    } else {
      setQuizQuestions([]);
    }
  };

  // Refetch all AI content when GLOBAL study language changes
  useEffect(() => {
    if (id && profile) {
      console.log(`[AI Content] Language changed to: ${studyLanguage}`);
      // Clear all AI content before fetching new language
      setSummary(null);
      setFlashcards([]);
      setQuizQuestions([]);
      
      fetchSummary(studyLanguage);
      fetchFlashcards(studyLanguage);
      fetchQuizQuestions(studyLanguage);
    }
  }, [id, studyLanguage, profile]);

  // Execute summary generation (internal - uses getTextForAi)
  const executeGenerateSummary = async () => {
    const textForAi = getTextForAi();
    if (!material || !textForAi || !id) {
      toast.error('No text available to summarize');
      return;
    }

    setIsGeneratingSummary(true);
    
    try {
      const response = await supabase.functions.invoke('generate-summary', {
        body: {
          material_id: id,
          ocr_text: textForAi,
          title: material.title,
          topic: material.topic,
          language: studyLanguage,
        },
      });

      if (response.error) {
        console.error('Summary error:', response.error);
        toast.error(response.error.message || 'Failed to generate summary');
        return;
      }

      if (response.data?.error) {
        toast.error(response.data.error);
        return;
      }

      setSummary(response.data.summary);
      toast.success('Summary generated!');
    } catch (err) {
      console.error('Generate summary error:', err);
      toast.error('Failed to generate summary');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Public handler - checks translation first
  const handleGenerateSummary = () => {
    if (checkTranslationBeforeAi('summary')) {
      executeGenerateSummary();
    }
  };

  // Execute flashcards generation (internal - uses getTextForAi)
  const executeGenerateFlashcards = async () => {
    const textForAi = getTextForAi();
    if (!material || !textForAi || !id) {
      toast.error('No text available to generate flashcards');
      return;
    }

    setIsGeneratingFlashcards(true);
    
    try {
      const response = await supabase.functions.invoke('generate-flashcards', {
        body: {
          material_id: id,
          ocr_text: textForAi,
          title: material.title,
          topic: material.topic,
          count: 15,
          language: studyLanguage,
        },
      });

      if (response.error) {
        console.error('Flashcards error:', response.error);
        toast.error(response.error.message || 'Failed to generate flashcards');
        return;
      }

      if (response.data?.error) {
        toast.error(response.data.error);
        return;
      }

      setFlashcards(response.data.flashcards);
      setFlashcardWarnings(response.data.warnings || []);
      toast.success(`${response.data.flashcards.length} flashcards generated!`);
    } catch (err) {
      console.error('Generate flashcards error:', err);
      toast.error('Failed to generate flashcards');
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  // Public handler - checks translation first
  const handleGenerateFlashcards = () => {
    if (checkTranslationBeforeAi('flashcards')) {
      executeGenerateFlashcards();
    }
  };

  // Execute quiz generation (internal - uses getTextForAi)
  const executeGenerateQuiz = async () => {
    const textForAi = getTextForAi();
    if (!material || !textForAi || !id) {
      toast.error('No text available to generate quiz');
      return;
    }

    setIsGeneratingQuiz(true);
    setQuizAnswers({});
    setShowQuizResults(false);
    
    try {
      const response = await supabase.functions.invoke('generate-quiz', {
        body: {
          material_id: id,
          ocr_text: textForAi,
          title: material.title,
          topic: material.topic,
          count: 8,
          language: studyLanguage,
        },
      });

      if (response.error) {
        console.error('Quiz error:', response.error);
        toast.error(response.error.message || 'Failed to generate quiz');
        return;
      }

      if (response.data?.error) {
        toast.error(response.data.error);
        return;
      }

      setQuizQuestions(response.data.questions);
      setQuizWarnings(response.data.warnings || []);
      toast.success(`${response.data.questions.length} quiz questions generated!`);
    } catch (err) {
      console.error('Generate quiz error:', err);
      toast.error('Failed to generate quiz');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Public handler - checks translation first
  const handleGenerateQuiz = () => {
    if (checkTranslationBeforeAi('quiz')) {
      executeGenerateQuiz();
    }
  };

  // Handle quiz answer selection
  const handleQuizAnswer = (questionId: string, optionIndex: number) => {
    if (showQuizResults) return; // Don't allow changes after submitting
    setQuizAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  // Submit quiz
  const handleSubmitQuiz = () => {
    setShowQuizResults(true);
  };

  // Reset quiz
  const handleResetQuiz = () => {
    setQuizAnswers({});
    setShowQuizResults(false);
  };

  // Calculate quiz score
  const getQuizScore = () => {
    let correct = 0;
    quizQuestions.forEach(q => {
      if (quizAnswers[q.id] === q.correct_index) {
        correct++;
      }
    });
    return { correct, total: quizQuestions.length };
  };

  // Translate text to selected language
  const handleTranslate = async (targetLang: SupportedLanguage) => {
    if (!material || !translationData || !id) {
      toast.error('No text available to translate');
      return;
    }

    // Don't translate if already exists
    if (hasTranslation(translationData, targetLang)) {
      setViewLanguage(targetLang);
      return;
    }

    setIsTranslating(true);
    
    try {
      // Use new materialId-based API
      const response = await supabase.functions.invoke('translate-text', {
        body: {
          materialId: id,
          targetLanguage: targetLang,
        },
      });

      if (response.error) {
        console.error('Translation error:', response.error);
        toast.error(response.error.message || 'Failed to translate');
        return;
      }

      if (response.data?.error) {
        toast.error(response.data.error);
        return;
      }

      const translatedText = response.data.translatedText;
      const isManual = response.data.isManual || false;
      
      // Update local translation data with new version
      const updatedData = setTranslation(translationData, targetLang, translatedText);
      setTranslationData(updatedData);
      setViewLanguage(targetLang);

      // Note: The edge function already saves to DB, so we don't need to save here
      toast.success(`Translated to ${LANGUAGE_NAMES[targetLang]}`);
    } catch (err) {
      console.error('Translate error:', err);
      toast.error('Failed to translate text');
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    const fetchMaterial = async () => {
      if (!id || !user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('materials')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (fetchError) {
          console.error('Fetch error:', fetchError);
          setError('Failed to load material');
          return;
        }

        if (!data) {
          setError('Material not found');
          return;
        }

        setMaterial(data);
        
        // Parse translation data from notes field
        const parsed = parseTranslationData(data.notes);
        if (parsed) {
          setTranslationData(parsed);
        } else if (data.ocr_text) {
          // Initialize translation data from ocr_text if notes is empty
          const sourceLanguage = detectSourceLanguage(data.ocr_text);
          const newTranslationData = createTranslationData(data.ocr_text, sourceLanguage);
          setTranslationData(newTranslationData);
        }
      } catch (err) {
        console.error('Error:', err);
        setError('An unexpected error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMaterial();
    // AI content is fetched via the useEffect that depends on selectedLanguage
  }, [id, user]);

  // Redirect to home if material not found (after loading completes)
  useEffect(() => {
    if (!isLoading && (error || !material)) {
      toast.error(error || 'Material not found');
      navigate('/', { replace: true });
    }
  }, [isLoading, error, material, navigate]);

  // Show loading or redirecting state
  if (isLoading || error || !material) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Photos to display (either from edit form or material)
  const displayPhotos = isEditing ? editForm.photos : getMaterialPhotos(material);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} disabled={isEditing}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Material title"
                className="font-semibold"
              />
            ) : (
              <>
                <h1 className="font-semibold truncate">
                  {material.title || 'Untitled'}
                </h1>
                <p className="text-xs text-muted-foreground">{material.topic}</p>
              </>
            )}
          </div>
          {!isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={startEditing}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setShowDeleteMaterial(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete material
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 pb-8">
        {/* Meta info */}
        <Card className="mb-4">
          <CardContent className="pt-4 space-y-3">
            {/* Topic */}
            {isEditing ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Topic</label>
                <Select
                  value={editForm.topic}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, topic: value as Topic }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOPICS.map((topic) => (
                      <SelectItem key={topic} value={topic}>
                        {topic}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {/* Date - read only */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {material.created_at
                  ? format(new Date(material.created_at), 'PPP')
                  : 'Unknown date'}
              </span>
            </div>

            {/* Tags */}
            {isEditing ? (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags (comma-separated)
                </label>
                <Input
                  value={editForm.tags}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, tags: e.target.value }))}
                  placeholder="e.g. anatomy, heart, cardiology"
                />
              </div>
            ) : (
              material.tags && material.tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  {material.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="text" className="w-full">
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="text" className="text-xs px-2">
              <FileText className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="summary" className="text-xs px-2">
              <Sparkles className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="flashcards" className="text-xs px-2">
              <BookOpen className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="quiz" className="text-xs px-2">
              <HelpCircle className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="photos" className="text-xs px-2">
              <Image className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Lecture Text</CardTitle>
                    {/* Source language badge - show when viewing in different language */}
                    {!isEditing && translationData && studyLanguage !== translationData.sourceLanguage && (
                      <Badge variant="outline" className="text-xs">
                        Original: {LANGUAGE_CODES[translationData.sourceLanguage]}
                      </Badge>
                    )}
                  </div>
                  {!isEditing && translationData && (
                    <div className="flex gap-1">
                      {(['ru', 'de', 'en'] as const).map((lang) => {
                        const available = hasTranslation(translationData, lang);
                        const isSource = translationData.sourceLanguage === lang;
                        const isManual = isVersionManual(translationData, lang);
                        return (
                          <Button
                            key={lang}
                            variant={viewLanguage === lang ? 'default' : available ? 'outline' : 'ghost'}
                            size="sm"
                            onClick={() => setViewLanguage(lang)}
                            className="text-xs uppercase"
                          >
                            {lang}
                            {isSource && <span className="ml-1 opacity-50">•</span>}
                            {available && isManual && !isSource && <span className="ml-1 opacity-50">✓</span>}
                            {!available && !isSource && <span className="ml-1 opacity-50">?</span>}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {!isEditing && translationData && viewLanguage !== translationData.sourceLanguage && hasTranslation(translationData, viewLanguage) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {isVersionManual(translationData, viewLanguage) ? 'Manually edited' : `Translated from ${LANGUAGE_NAMES[translationData.sourceLanguage]}`}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <Textarea
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    placeholder="Enter lecture text..."
                    className="min-h-[300px] font-mono text-sm"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                ) : isTranslating ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{t('ai.translating')}</p>
                  </div>
                ) : translationData && hasTranslation(translationData, viewLanguage) ? (
                  <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                    {getTextInLanguage(translationData, viewLanguage)}
                  </pre>
                ) : translationData ? (
                  // No translation for selected language - show translate button
                  <div className="text-center py-8 space-y-4">
                    <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {t('material.noTranslation', { lang: LANGUAGE_NAMES[viewLanguage] })}
                    </p>
                    <Button onClick={() => handleTranslate(viewLanguage)} disabled={isTranslating}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {t('material.translateTo', { lang: LANGUAGE_NAMES[viewLanguage] })}
                    </Button>
                  </div>
                ) : material.ocr_text ? (
                  <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                    {material.ocr_text}
                  </pre>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t('material.noText')}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="summary" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Summary</CardTitle>
                  {summary && (
                    <div className="flex gap-1">
                      {(['short', 'medium', 'long'] as const).map((level) => (
                        <Button
                          key={level}
                          variant={summaryLevel === level ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSummaryLevel(level)}
                          className="text-xs capitalize"
                        >
                          {level}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isGeneratingSummary ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{t('ai.generatingSummary')}</p>
                  </div>
                ) : summary ? (
                  <>
                    {/* Warnings */}
                    {summary.warnings && summary.warnings.length > 0 && (
                      <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 space-y-2">
                        <div className="flex items-center gap-2 text-warning text-sm font-medium">
                          <Info className="h-4 w-4" />
                          {t('ai.needsClarification')}
                        </div>
                        <ul className="text-xs text-warning-foreground space-y-1 ml-6 list-disc">
                          {summary.warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Summary content */}
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-transparent p-0 m-0">
                        {summaryLevel === 'short' && summary.short_summary}
                        {summaryLevel === 'medium' && summary.medium_summary}
                        {summaryLevel === 'long' && summary.long_summary}
                      </pre>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Generated {new Date(summary.generated_at).toLocaleDateString()}
                    </p>
                  </>
                ) : (
                  <div className="text-center py-8 space-y-4">
                    <Sparkles className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {t('ai.noSummaryInLang', { lang: LANGUAGE_NAMES[studyLanguage] })}
                    </p>
                    <Button onClick={handleGenerateSummary} disabled={isGeneratingSummary}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {t('ai.generateIn', { lang: studyLanguage.toUpperCase() })}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flashcards" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Flashcards</CardTitle>
                  {flashcards.length > 0 && (
                    <Badge variant="secondary">{flashcards.length} cards</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isGeneratingFlashcards ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{t('ai.generatingFlashcards')}</p>
                  </div>
                ) : flashcards.length > 0 ? (
                  <>
                    {/* Warnings */}
                    {flashcardWarnings.length > 0 && (
                      <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 space-y-2">
                        <div className="flex items-center gap-2 text-warning text-sm font-medium">
                          <Info className="h-4 w-4" />
                          {t('ai.notes')}
                        </div>
                        <ul className="text-xs text-warning-foreground space-y-1 ml-6 list-disc">
                          {flashcardWarnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Start review button */}
                    <Button 
                      className="w-full"
                      onClick={() => navigate('/review')}
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      {t('ai.startReview')}
                    </Button>
                    
                    {/* Flashcards list */}
                    <div className="space-y-3">
                      {flashcards.map((card, idx) => (
                        <Card key={card.id} className="border-l-4" style={{
                          borderLeftColor: card.confidence === 'high' ? 'hsl(var(--primary))' : 
                            card.confidence === 'medium' ? 'hsl(var(--warning))' : 'hsl(var(--destructive))'
                        }}>
                          <CardContent className="py-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium">{idx + 1}. {card.question}</p>
                              <Badge 
                                variant={card.confidence === 'high' ? 'default' : 
                                  card.confidence === 'medium' ? 'secondary' : 'destructive'}
                                className="text-xs shrink-0"
                              >
                                {card.confidence}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{card.answer}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 space-y-4">
                    <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {t('ai.noFlashcardsInLang', { lang: LANGUAGE_NAMES[studyLanguage] })}
                    </p>
                    <Button onClick={handleGenerateFlashcards} disabled={isGeneratingFlashcards}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      {t('ai.generateIn', { lang: studyLanguage.toUpperCase() })}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quiz" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Quiz</CardTitle>
                    {/* Debug badge showing current filter language */}
                    <Badge variant="outline" className="text-xs">
                      {studyLanguage.toUpperCase()}
                    </Badge>
                  </div>
                  {showQuizResults && (
                    <Badge variant={getQuizScore().correct === getQuizScore().total ? 'default' : 'secondary'}>
                      {getQuizScore().correct}/{getQuizScore().total} correct
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isGeneratingQuiz ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{t('ai.generatingQuiz')}</p>
                  </div>
                ) : quizQuestions.length > 0 ? (
                  <>
                    {/* Warnings */}
                    {quizWarnings.length > 0 && (
                      <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 space-y-2">
                        <div className="flex items-center gap-2 text-warning text-sm font-medium">
                          <Info className="h-4 w-4" />
                          {t('ai.notes')}
                        </div>
                        <ul className="text-xs text-warning-foreground space-y-1 ml-6 list-disc">
                          {quizWarnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Quiz questions */}
                    <div className="space-y-6">
                      {quizQuestions.map((q, qIdx) => (
                        <div key={q.id} className="space-y-3">
                          <div className="flex items-start gap-2">
                            <span className="font-medium text-sm">{qIdx + 1}.</span>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{q.question}</p>
                              {q.confidence !== 'high' && (
                                <Badge 
                                  variant={q.confidence === 'medium' ? 'secondary' : 'destructive'}
                                  className="text-xs mt-1"
                                >
                                  {q.confidence} confidence
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2 ml-5">
                            {q.options.map((option, optIdx) => {
                              const isSelected = quizAnswers[q.id] === optIdx;
                              const isCorrect = q.correct_index === optIdx;
                              const showResult = showQuizResults;
                              
                              let optionClass = "w-full justify-start text-left h-auto py-2 px-3";
                              if (showResult) {
                                if (isCorrect) {
                                  optionClass += " bg-green-500/20 border-green-500 text-green-700 dark:text-green-300";
                                } else if (isSelected && !isCorrect) {
                                  optionClass += " bg-destructive/20 border-destructive text-destructive";
                                }
                              } else if (isSelected) {
                                optionClass += " bg-primary/10 border-primary";
                              }
                              
                              return (
                                <Button
                                  key={optIdx}
                                  variant="outline"
                                  className={optionClass}
                                  onClick={() => handleQuizAnswer(q.id, optIdx)}
                                  disabled={showQuizResults}
                                >
                                  <span className="font-medium mr-2">{String.fromCharCode(65 + optIdx)}.</span>
                                  <span className="flex-1">{option}</span>
                                </Button>
                              );
                            })}
                          </div>
                          {/* Explanation after submit */}
                          {showQuizResults && q.explanation && (
                            <div className="ml-5 p-3 rounded-lg bg-muted text-sm">
                              <p className="font-medium text-xs text-muted-foreground mb-1">Explanation:</p>
                              <p>{q.explanation}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Submit/Reset buttons */}
                    <div className="flex gap-3">
                      {!showQuizResults ? (
                        <Button 
                          className="flex-1"
                          onClick={handleSubmitQuiz}
                          disabled={Object.keys(quizAnswers).length !== quizQuestions.length}
                        >
                          Submit Quiz
                        </Button>
                      ) : (
                        <Button 
                          variant="outline"
                          className="flex-1"
                          onClick={handleResetQuiz}
                        >
                          Try Again
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 space-y-4">
                    <HelpCircle className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {t('ai.noQuizInLang', { lang: LANGUAGE_NAMES[studyLanguage] })}
                    </p>
                    <Button onClick={handleGenerateQuiz} disabled={isGeneratingQuiz}>
                      <HelpCircle className="mr-2 h-4 w-4" />
                      {t('ai.generateIn', { lang: studyLanguage.toUpperCase() })}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="photos" className="mt-4">
            {/* Hidden file input for adding photos */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddPhotos}
            />

            {/* Add photos button in edit mode */}
            {isEditing && (
              <Button
                variant="outline"
                className="w-full mb-4"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhotos}
              >
                {isUploadingPhotos ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add photos
                  </>
                )}
              </Button>
            )}

            {displayPhotos.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {displayPhotos.map((photo, idx) => (
                    <Card
                      key={idx}
                      className={`overflow-hidden relative ${!isEditing ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
                      onClick={() => openLightbox(idx)}
                    >
                      <div className="relative">
                        <img
                          src={photo.url}
                          alt={`Photo ${idx + 1}`}
                          className="w-full h-40 object-cover pointer-events-none"
                        />
                        {isEditing && (
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletePhotoIndex(idx);
                            }}
                            disabled={isDeletingPhoto}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
                {!isEditing && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Tap to zoom
                  </p>
                )}
                {!isEditing && displayPhotos.length > 0 && (
                  <ImageLightbox
                    images={displayPhotos.map(p => p.url)}
                    initialIndex={lightboxIndex}
                    isOpen={lightboxOpen}
                    onClose={() => setLightboxOpen(false)}
                  />
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    {isEditing ? 'No photos yet. Click "Add photos" above.' : 'No photos available'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* AI Study Tools Section - only show when not editing */}
        {!isEditing && material.ocr_text && (
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('ai.studyTools')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={handleGenerateSummary}
                  disabled={isGeneratingSummary}
                >
                  {isGeneratingSummary ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <FileText className="h-5 w-5 text-primary" />
                  )}
                  <span className="text-xs font-medium">
                    {isGeneratingSummary ? t('ai.generating') : t('ai.summarize')}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={handleGenerateFlashcards}
                  disabled={isGeneratingFlashcards}
                >
                  {isGeneratingFlashcards ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <BookOpen className="h-5 w-5 text-primary" />
                  )}
                  <span className="text-xs font-medium">
                    {isGeneratingFlashcards ? t('ai.generating') : t('ai.flashcards')}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={handleGenerateQuiz}
                  disabled={isGeneratingQuiz}
                >
                  {isGeneratingQuiz ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <HelpCircle className="h-5 w-5 text-primary" />
                  )}
                  <span className="text-xs font-medium">
                    {isGeneratingQuiz ? t('ai.generating') : t('ai.quiz')}
                  </span>
                </Button>
              </div>

              {/* Safety Note */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  {t('ai.safetyNote')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}


        {isEditing && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={cancelEditing}
              disabled={isSaving}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save changes
            </Button>
          </div>
        )}

        {/* Delete photo confirmation dialog */}
        <AlertDialog open={deletePhotoIndex !== null} onOpenChange={(open) => !open && setDeletePhotoIndex(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this photo permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The photo will be permanently removed from storage and this material.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingPhoto}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePhoto}
                disabled={isDeletingPhoto}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeletingPhoto ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete material confirmation dialog */}
        <AlertDialog open={showDeleteMaterial} onOpenChange={setShowDeleteMaterial}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this material?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this material along with all its flashcards, quizzes, and summaries. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingMaterial}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMaterial}
                disabled={isDeletingMaterial}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeletingMaterial ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Translation prompt dialog */}
        <TranslationPromptDialog
          open={showTranslationPrompt}
          onOpenChange={setShowTranslationPrompt}
          targetLanguage={studyLanguage}
          isTranslating={isTranslating}
          onTranslateAndContinue={handleTranslateAndContinue}
          onUseSource={handleUseSourceForAi}
        />
      </main>
    </div>
  );
}
