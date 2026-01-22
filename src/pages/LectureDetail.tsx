import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, Image, Calendar, Tag, Loader2, Pencil, Trash2, X, Save, MoreVertical } from 'lucide-react';
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
import { Topic } from '@/lib/types';

interface Material {
  id: string;
  title: string | null;
  topic: string;
  tags: string[] | null;
  ocr_text: string | null;
  images: string[] | null;
  created_at: string | null;
}

interface EditForm {
  title: string;
  topic: Topic;
  tags: string;
  ocr_text: string;
  images: string[];
}

export default function LectureDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

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
    images: [],
  });
  
  // Separate draft state for text to prevent cursor jumping
  const [textDraft, setTextDraft] = useState('');
  
  // Photo deletion state
  const [deletePhotoIndex, setDeletePhotoIndex] = useState<number | null>(null);
  
  // Material deletion state
  const [showDeleteMaterial, setShowDeleteMaterial] = useState(false);
  const [isDeletingMaterial, setIsDeletingMaterial] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);

  const openLightbox = (index: number) => {
    if (isEditing) return; // Don't open lightbox in edit mode
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Initialize edit form from material - textDraft is set ONCE here
  const startEditing = () => {
    if (!material) return;
    setEditForm({
      title: material.title || '',
      topic: (material.topic as Topic) || 'Sonstiges',
      tags: material.tags?.join(', ') || '',
      ocr_text: material.ocr_text || '',
      images: material.images || [],
    });
    // Initialize textDraft once from material
    setTextDraft(material.ocr_text || '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    // Reset form and textDraft to original values
    if (material) {
      setEditForm({
        title: material.title || '',
        topic: (material.topic as Topic) || 'Sonstiges',
        tags: material.tags?.join(', ') || '',
        ocr_text: material.ocr_text || '',
        images: material.images || [],
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
    
    const photoUrl = editForm.images[deletePhotoIndex];
    if (!photoUrl) return;

    setIsDeletingPhoto(true);
    try {
      // Remove URL from array
      const updatedImages = editForm.images.filter((_, idx) => idx !== deletePhotoIndex);

      // Update database immediately
      const { error: updateError } = await supabase
        .from('materials')
        .update({ images: updatedImages })
        .eq('id', id);

      if (updateError) {
        console.error('Failed to update images:', updateError);
        toast.error('Failed to delete photo');
        return;
      }

      // Try to delete from storage (optional, don't fail if it doesn't work)
      const storagePath = extractStoragePath(photoUrl);
      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from('materials')
          .remove([storagePath]);
        
        if (storageError) {
          console.warn('Storage deletion failed (non-critical):', storageError);
        }
      }

      // Update local state
      setEditForm((prev) => ({ ...prev, images: updatedImages }));
      setMaterial((prev) => prev ? { ...prev, images: updatedImages } : null);
      
      toast.success('Photo deleted');
    } catch (err) {
      console.error('Delete photo error:', err);
      toast.error('Failed to delete photo');
    } finally {
      setIsDeletingPhoto(false);
      setDeletePhotoIndex(null);
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
          images: editForm.images,
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
        images: editForm.images,
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
      // Delete related records first (flashcards, quiz_questions, summaries)
      await Promise.all([
        supabase.from('flashcards').delete().eq('material_id', id),
        supabase.from('quiz_questions').delete().eq('material_id', id),
        supabase.from('summaries').delete().eq('material_id', id),
      ]);

      // Try to delete photos from storage
      if (material.images && material.images.length > 0) {
        const storagePaths = material.images
          .map(url => extractStoragePath(url))
          .filter((path): path is string => path !== null);
        
        if (storagePaths.length > 0) {
          await supabase.storage.from('materials').remove(storagePaths);
        }
      }

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

      toast.success('Material deleted');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Delete material error:', err);
      toast.error('Failed to delete material');
    } finally {
      setIsDeletingMaterial(false);
      setShowDeleteMaterial(false);
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

  // Images to display (either from edit form or material)
  const displayImages = isEditing ? editForm.images : (material.images || []);

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
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="text" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Text
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Photos ({displayImages.length})
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

          <TabsContent value="photos" className="mt-4">
            {displayImages.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {displayImages.map((url, idx) => (
                    <Card
                      key={idx}
                      className={`overflow-hidden relative ${!isEditing ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
                      onClick={() => openLightbox(idx)}
                    >
                      <div className="relative">
                        <img
                          src={url}
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
                {!isEditing && material.images && material.images.length > 0 && (
                  <ImageLightbox
                    images={material.images}
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
                    No photos available
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit mode action buttons */}
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
              <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The photo will be permanently removed from this material.
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
