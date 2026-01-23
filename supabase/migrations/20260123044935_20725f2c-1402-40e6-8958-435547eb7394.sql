-- Add language column to flashcards table
ALTER TABLE public.flashcards 
ADD COLUMN IF NOT EXISTS language text DEFAULT 'ru';

-- Add language column to quiz_questions table
ALTER TABLE public.quiz_questions 
ADD COLUMN IF NOT EXISTS language text DEFAULT 'ru';

-- Add language column to summaries table
ALTER TABLE public.summaries 
ADD COLUMN IF NOT EXISTS language text DEFAULT 'ru';

-- Create indexes for faster filtering by language
CREATE INDEX IF NOT EXISTS idx_flashcards_language ON public.flashcards(material_id, language);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_language ON public.quiz_questions(material_id, language);
CREATE INDEX IF NOT EXISTS idx_summaries_language ON public.summaries(material_id, language);