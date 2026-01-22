import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfidenceBadgeProps {
  confidence: 'high' | 'medium' | 'low';
  showLabel?: boolean;
  className?: string;
}

const confidenceConfig = {
  high: {
    icon: CheckCircle,
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
  },
  medium: {
    icon: HelpCircle,
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  },
  low: {
    icon: AlertTriangle,
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  },
};

export function ConfidenceBadge({ confidence, showLabel = true, className }: ConfidenceBadgeProps) {
  const { t } = useTranslation();
  const config = confidenceConfig[confidence];
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={cn('gap-1 font-normal', config.className, className)}
    >
      <Icon className="h-3 w-3" />
      {showLabel && <span>{t(`confidence.${confidence}`)}</span>}
    </Badge>
  );
}
