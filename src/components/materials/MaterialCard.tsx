import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Image } from 'lucide-react';
import { Material } from '@/lib/types';
import { TOPIC_LABELS } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';
import { ru, de, enUS } from 'date-fns/locale';
import { Link } from 'react-router-dom';

interface MaterialCardProps {
  material: Material;
}

const locales = { ru, de, en: enUS };

export function MaterialCard({ material }: MaterialCardProps) {
  const { t, i18n } = useTranslation();
  const locale = locales[i18n.language as keyof typeof locales] || ru;
  
  // Handle nullable arrays from database
  const images = material.images ?? [];
  const tags = material.tags ?? [];
  
  const topicLabel = TOPIC_LABELS[material.topic as keyof typeof TOPIC_LABELS]?.[
    i18n.language as 'ru' | 'de' | 'en'
  ] || material.topic;

  const timeAgo = formatDistanceToNow(new Date(material.created_at), {
    addSuffix: true,
    locale,
  });

  return (
    <Link to={`/material/${material.id}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                {images.length > 0 ? (
                  <Image className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )}
                <h3 className="font-medium line-clamp-1">
                  {material.title || t('material.text')}
                </h3>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {topicLabel}
                </Badge>
                {tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
              
              {material.ocr_text && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {material.ocr_text.slice(0, 100)}...
                </p>
              )}
              
              <p className="text-xs text-muted-foreground">{timeAgo}</p>
            </div>
            
            {images.length > 0 && (
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                <img
                  src={images[0]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
