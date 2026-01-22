import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ImageCapture } from '@/components/materials/ImageCapture';
import { OcrPreview } from '@/components/materials/OcrPreview';
import { TopicSelector } from '@/components/materials/TopicSelector';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Topic } from '@/lib/types';
import { toast } from 'sonner';

type Step = 1 | 2 | 3;

export default function AddMaterial() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [images, setImages] = useState<string[]>([]);
  const [ocrText, setOcrText] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState<'high' | 'medium' | 'low'>('medium');
  const [topic, setTopic] = useState<Topic | ''>('');
  const [tags, setTags] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const progress = (step / 3) * 100;

  const handleNextClick = (e: React.MouseEvent) => {
    // Prevent any form submission or event bubbling
    e.preventDefault();
    e.stopPropagation();
    
    // Debug toast - this MUST appear
    toast.info('Next clicked');
    console.log('Next button clicked, images:', images.length);
    
    // Validate: require at least 1 photo
    if (images.length === 0) {
      toast.error('Please select at least 1 photo / Выберите хотя бы 1 фото');
      return;
    }
    
    // Store photos in sessionStorage
    sessionStorage.setItem('materialImages', JSON.stringify(images));
    sessionStorage.setItem('pendingOcr', 'true');
    
    // Navigate immediately
    navigate('/review-text');
  };

  const handleSave = async () => {
    if (!user) {
      toast.error('Не авторизован');
      return;
    }

    if (!topic) {
      toast.error('Выберите тему');
      return;
    }

    setIsSaving(true);

    try {
      // Upload images to storage
      const imageUrls: string[] = [];
      
      for (let i = 0; i < images.length; i++) {
        const base64Data = images[i].split(',')[1];
        const fileName = `${user.id}/${Date.now()}_${i}.jpg`;
        
        // Convert base64 to blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let j = 0; j < byteCharacters.length; j++) {
          byteNumbers[j] = byteCharacters.charCodeAt(j);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('materials')
          .upload(fileName, blob);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('materials')
          .getPublicUrl(fileName);

        if (urlData) {
          imageUrls.push(urlData.publicUrl);
        }
      }

      // Save material to database
      const { data: material, error: dbError } = await supabase
        .from('materials')
        .insert({
          user_id: user.id,
          title: title || null,
          topic,
          tags: tags.length > 0 ? tags : null,
          ocr_text: ocrText,
          images: imageUrls.length > 0 ? imageUrls : null,
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        toast.error('Ошибка сохранения');
        return;
      }

      toast.success('Материал сохранён!');
      navigate(`/lecture/${material.id}`);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return images.length > 0;
      case 2:
        return ocrText.trim().length > 0;
      case 3:
        return topic !== '';
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (step === 1 ? navigate(-1) : setStep((step - 1) as Step))}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold">{t('material.add')}</h1>
            <p className="text-xs text-muted-foreground">
              {t('common.step')} {step} / 3
            </p>
          </div>
        </div>
        <Progress value={progress} className="mt-2 h-1" />
      </header>

      {/* Content */}
      <main className="flex-1 p-4 pb-24">
        {step === 1 && (
          <ImageCapture images={images} onImagesChange={setImages} />
        )}

        {step === 2 && (
          <OcrPreview
            text={ocrText}
            confidence={ocrConfidence}
            onTextChange={setOcrText}
          />
        )}

        {step === 3 && (
          <TopicSelector
            topic={topic}
            tags={tags}
            title={title}
            onTopicChange={setTopic}
            onTagsChange={setTags}
            onTitleChange={setTitle}
          />
        )}
      </main>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t z-50">
        {step === 1 && (
          <Button
            type="button"
            className="w-full pointer-events-auto"
            size="lg"
            onClick={handleNextClick}
          >
            <ArrowRight className="mr-2 h-5 w-5" />
            {t('common.next')}
          </Button>
        )}

        {step === 2 && (
          <Button
            className="w-full"
            size="lg"
            disabled={!canProceed()}
            onClick={() => setStep(3)}
          >
            <ArrowRight className="mr-2 h-5 w-5" />
            {t('common.next')}
          </Button>
        )}

        {step === 3 && (
          <Button
            className="w-full"
            size="lg"
            disabled={!canProceed() || isSaving}
            onClick={handleSave}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-5 w-5" />
                {t('common.save')}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
