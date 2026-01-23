-- Rename existing language column to preferred_study_language
ALTER TABLE public.profiles 
RENAME COLUMN language TO preferred_study_language;

-- Add ui_language column
ALTER TABLE public.profiles 
ADD COLUMN ui_language text DEFAULT 'ru'::text;