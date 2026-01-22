import { Topic } from './types';

export const TOPICS: Topic[] = [
  'Anatomie',
  'Hygiene',
  'Pflegepraxis',
  'Recht/Ethik',
  'Medikamente',
  'Sonstiges',
];

export const TOPIC_LABELS: Record<Topic, { ru: string; de: string; en: string }> = {
  'Anatomie': { ru: 'Анатомия', de: 'Anatomie', en: 'Anatomy' },
  'Hygiene': { ru: 'Гигиена', de: 'Hygiene', en: 'Hygiene' },
  'Pflegepraxis': { ru: 'Уход за пациентами', de: 'Pflegepraxis', en: 'Nursing Practice' },
  'Recht/Ethik': { ru: 'Право и этика', de: 'Recht/Ethik', en: 'Law/Ethics' },
  'Medikamente': { ru: 'Медикаменты', de: 'Medikamente', en: 'Medications' },
  'Sonstiges': { ru: 'Прочее', de: 'Sonstiges', en: 'Other' },
};

export const SPACED_REPETITION_INTERVALS = [1, 2, 4, 7]; // days for stages 0, 1, 2, 3

export const DEFAULT_FLASHCARD_COUNT = 15;
export const DEFAULT_QUIZ_COUNT = 8;

export const CONFIDENCE_COLORS = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};
