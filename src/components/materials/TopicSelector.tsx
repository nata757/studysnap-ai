import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { TOPICS, TOPIC_LABELS } from '@/lib/constants';
import { Topic } from '@/lib/types';
import { useState } from 'react';

interface TopicSelectorProps {
  topic: Topic | '';
  tags: string[];
  title: string;
  onTopicChange: (topic: Topic) => void;
  onTagsChange: (tags: string[]) => void;
  onTitleChange: (title: string) => void;
}

export function TopicSelector({
  topic,
  tags,
  title,
  onTopicChange,
  onTagsChange,
  onTitleChange,
}: TopicSelectorProps) {
  const { t, i18n } = useTranslation();
  const [tagInput, setTagInput] = useState('');

  const lang = i18n.language as 'ru' | 'de' | 'en';

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (newTag && !tags.includes(newTag)) {
        onTagsChange([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">{t('material.title')}</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('material.title')}
        />
      </div>

      {/* Topic */}
      <div className="space-y-2">
        <Label>{t('material.selectTopic')}</Label>
        <Select value={topic} onValueChange={(value) => onTopicChange(value as Topic)}>
          <SelectTrigger>
            <SelectValue placeholder={t('material.selectTopic')} />
          </SelectTrigger>
          <SelectContent>
            {TOPICS.map((t) => (
              <SelectItem key={t} value={t}>
                {TOPIC_LABELS[t][lang] || TOPIC_LABELS[t].en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label htmlFor="tags">{t('material.addTags')}</Label>
        <Input
          id="tags"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Enter, запятая для добавления"
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
