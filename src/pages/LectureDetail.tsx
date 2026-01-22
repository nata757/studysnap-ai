import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, Image, Calendar, Tag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

interface Material {
  id: string;
  title: string | null;
  topic: string;
  tags: string[] | null;
  ocr_text: string | null;
  images: string[] | null;
  created_at: string | null;
}

export default function LectureDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [material, setMaterial] = useState<Material | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !material) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-10 bg-background border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold">Error</h1>
          </div>
        </header>
        <main className="flex-1 p-4 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">{error || 'Material not found'}</p>
            <Button className="mt-4" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">
              {material.title || 'Untitled'}
            </h1>
            <p className="text-xs text-muted-foreground">{material.topic}</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 pb-8">
        {/* Meta info */}
        <Card className="mb-4">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {material.created_at
                  ? format(new Date(material.created_at), 'PPP')
                  : 'Unknown date'}
              </span>
            </div>
            
            {material.tags && material.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="h-4 w-4 text-muted-foreground" />
                {material.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
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
              Photos ({material.images?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lecture Text</CardTitle>
              </CardHeader>
              <CardContent>
                {material.ocr_text ? (
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
            {material.images && material.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {material.images.map((url, idx) => (
                  <Card key={idx} className="overflow-hidden">
                    <img
                      src={url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-40 object-cover"
                    />
                  </Card>
                ))}
              </div>
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
      </main>
    </div>
  );
}
