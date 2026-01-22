import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MaterialCard } from '@/components/materials/MaterialCard';
import { Search as SearchIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Material } from '@/lib/types';
import { TOPICS, TOPIC_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export default function Search() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    const searchMaterials = async () => {
      setLoading(true);
      
      let queryBuilder = supabase
        .from('materials')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (selectedTopic) {
        queryBuilder = queryBuilder.eq('topic', selectedTopic);
      }

      const { data } = await queryBuilder;

      if (data) {
        let filtered = data as Material[];
        
        if (query.trim()) {
          const lowerQuery = query.toLowerCase();
          filtered = filtered.filter(
            (m) =>
              m.title?.toLowerCase().includes(lowerQuery) ||
              m.ocr_text?.toLowerCase().includes(lowerQuery) ||
              m.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
          );
        }
        
        setMaterials(filtered);
      }
      
      setLoading(false);
    };

    const debounce = setTimeout(searchMaterials, 300);
    return () => clearTimeout(debounce);
  }, [user, query, selectedTopic]);

  return (
    <AppLayout title={t('search.title')} showLogo={false}>
      <div className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Topic Filter */}
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={selectedTopic === null ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedTopic(null)}
          >
            {t('search.filterByTopic')}
          </Badge>
          {TOPICS.map((topic) => (
            <Badge
              key={topic}
              variant={selectedTopic === topic ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedTopic(topic === selectedTopic ? null : topic)}
            >
              {TOPIC_LABELS[topic][i18n.language as 'ru' | 'de' | 'en']}
            </Badge>
          ))}
        </div>

        {/* Results */}
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            {t('common.loading')}
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
              <p className="text-muted-foreground">{t('search.noResults')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
