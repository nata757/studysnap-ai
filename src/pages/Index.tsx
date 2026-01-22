import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MaterialCard } from '@/components/materials/MaterialCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Material, Flashcard } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

export default function Index() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [dueCardsCount, setDueCardsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      
      // Fetch recent materials
      const { data: materialsData } = await supabase
        .from('materials')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (materialsData) {
        setMaterials(materialsData as Material[]);
      }

      // Fetch due flashcards count
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('flashcards')
        .select('*', { count: 'exact', head: true })
        .lte('due_date', today);

      setDueCardsCount(count || 0);
      setLoading(false);
    };

    fetchData();
  }, [user]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Review Today Block */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <RotateCcw className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('home.reviewToday')}</p>
                <p className="text-2xl font-bold">
                  {loading ? '...' : dueCardsCount} <span className="text-sm font-normal text-muted-foreground">{t('home.cards')}</span>
                </p>
              </div>
            </div>
            {dueCardsCount > 0 && (
              <Button asChild size="sm">
                <Link to="/review">{t('home.startReview')}</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Add Material Button */}
        <Button asChild className="w-full" size="lg">
          <Link to="/add-material">
            <Plus className="mr-2 h-5 w-5" />
            {t('home.addMaterial')}
          </Link>
        </Button>

        {/* Recent Materials */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t('home.recentMaterials')}</h2>
          
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : materials.length > 0 ? (
            <div className="space-y-3">
              {materials.map((material) => (
                <MaterialCard key={material.id} material={material} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">{t('home.noMaterials')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
