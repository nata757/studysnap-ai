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
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ImageLightbox } from '@/components/materials/ImageLightbox';
import { TOPICS } from '@/lib/constants';
import { Topic, PhotoData } from '@/lib/types';
import { deletePhoto, deletePhotosWithResults, uploadPhoto } from '@/lib/storage';

interface Material {
  id: string;
  title: string | null;
  topic: string;
  tags: string[] | null;
  ocr_text: string | null;
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

      const { error: updateError } = await supabase
        .from('materials')
        .update({
          title: editForm.title || null,
          topic: editForm.topic,
          tags: tagsArray,
          ocr_text: textDraft || null,
          photos: editForm.photos,
          images: editForm.photos.map(p => p.url), // Keep legacy in sync
        })
        .eq('id', id);

      if (updateError) {
        console.error('Update error:', updateError);
        toast.error('Failed to save changes');
        return;
      }

      // Update local state with textDraft
      setMaterial({
        ...material,
        title: editForm.title || null,
        topic: editForm.topic,
        tags: tagsArray,
        ocr_text: textDraft || null,
        photos: editForm.photos,
        images: editForm.photos.map(p => p.url),
      });

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

  // Fetch existing summary
  const fetchSummary = async () => {
    if (!id) return;
    
    const { data } = await supabase
      .from('summaries')
      .select('*')
      .eq('material_id', id)
      .maybeSingle();
    
    if (data) {
      setSummary(data);
    }
  };

  // Generate summary using AI
  const handleGenerateSummary = async () => {
    if (!material || !material.ocr_text || !id) {
      toast.error('No text available to summarize');
      return;
    }

    setIsGeneratingSummary(true);
    
    try {
      const response = await supabase.functions.invoke('generate-summary', {
        body: {
          material_id: id,
          ocr_text: material.ocr_text,
          title: material.title,
          topic: material.topic,
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
      } catch (err) {
        console.error('Error:', err);
        setError('An unexpected error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMaterial();
    fetchSummary();
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
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="text" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Text
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Photos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lecture Text</CardTitle>
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
                ) : material.ocr_text ? (
                  <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                    {material.ocr_text}
                  </pre>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No text available
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
                    <p className="text-sm text-muted-foreground">Generating summary...</p>
                  </div>
                ) : summary ? (
                  <>
                    {/* Warnings */}
                    {summary.warnings && summary.warnings.length > 0 && (
                      <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 space-y-2">
                        <div className="flex items-center gap-2 text-warning text-sm font-medium">
                          <Info className="h-4 w-4" />
                          Needs clarification
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
                  <div className="text-center py-8 space-y-3">
                    <Sparkles className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      No summary yet. Use the AI Study Tools below to generate one.
                    </p>
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
                AI Study Tools
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
                    {isGeneratingSummary ? 'Generating...' : 'Summarize'}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={() => toast.info('Flashcard generation coming soon!')}
                >
                  <BookOpen className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Flashcards</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={() => toast.info('Quiz generation coming soon!')}
                >
                  <HelpCircle className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Quiz</span>
                </Button>
              </div>

              {/* Safety Note */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  AI uses only your text. If something is missing, it will mark it as low confidence and ask to clarify.
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
      </main>
    </div>
  );
}
