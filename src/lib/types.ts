export interface Profile {
  id: string;
  language: string;
  exam_date: string | null;
  created_at: string;
}

export interface Material {
  id: string;
  user_id: string;
  title: string | null;
  topic: string;
  tags: string[] | null;
  ocr_text: string | null;
  notes: string | null;
  images: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Summary {
  id: string;
  material_id: string;
  short_summary: string | null;
  medium_summary: string | null;
  long_summary: string | null;
  warnings: string[];
  generated_at: string;
}

export interface Flashcard {
  id: string;
  material_id: string;
  question: string;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  stage: number;
  due_date: string;
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  material_id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  confidence: 'high' | 'medium' | 'low';
  created_at: string;
}

export const TOPICS = [
  'Anatomie',
  'Hygiene',
  'Pflegepraxis',
  'Recht/Ethik',
  'Medikamente',
  'Sonstiges',
] as const;

export type Topic = typeof TOPICS[number];

export type SummaryLevel = 'short' | 'medium' | 'long';

export interface OcrResult {
  text: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AiSummaryResult {
  short: string;
  medium: string;
  long: string;
  warnings: string[];
}

export interface AiFlashcardsResult {
  flashcards: Array<{
    q: string;
    a: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  warnings: string[];
}

export interface AiQuizResult {
  quiz: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  warnings: string[];
}
