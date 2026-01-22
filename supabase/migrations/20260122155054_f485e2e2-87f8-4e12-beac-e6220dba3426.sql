-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT DEFAULT 'ru',
  exam_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create materials table
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  topic TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  ocr_text TEXT,
  notes TEXT,
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on materials
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Materials policies
CREATE POLICY "Users can view own materials"
  ON public.materials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own materials"
  ON public.materials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own materials"
  ON public.materials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own materials"
  ON public.materials FOR DELETE
  USING (auth.uid() = user_id);

-- Create summaries table
CREATE TABLE public.summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE NOT NULL,
  short_summary TEXT,
  medium_summary TEXT,
  long_summary TEXT,
  warnings TEXT[] DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on summaries
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;

-- Summaries policies (through materials ownership)
CREATE POLICY "Users can view own summaries"
  ON public.summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = summaries.material_id
      AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own summaries"
  ON public.summaries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = summaries.material_id
      AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own summaries"
  ON public.summaries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = summaries.material_id
      AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own summaries"
  ON public.summaries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = summaries.material_id
      AND materials.user_id = auth.uid()
    )
  );

-- Create flashcards table
CREATE TABLE public.flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  stage INTEGER DEFAULT 0 CHECK (stage >= 0 AND stage <= 3),
  due_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on flashcards
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

-- Flashcards policies
CREATE POLICY "Users can view own flashcards"
  ON public.flashcards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = flashcards.material_id
      AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own flashcards"
  ON public.flashcards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = flashcards.material_id
      AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own flashcards"
  ON public.flashcards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = flashcards.material_id
      AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own flashcards"
  ON public.flashcards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = flashcards.material_id
      AND materials.user_id = auth.uid()
    )
  );

-- Create quiz_questions table
CREATE TABLE public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on quiz_questions
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- Quiz questions policies
CREATE POLICY "Users can view own quiz questions"
  ON public.quiz_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = quiz_questions.material_id
      AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own quiz questions"
  ON public.quiz_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = quiz_questions.material_id
      AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own quiz questions"
  ON public.quiz_questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = quiz_questions.material_id
      AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own quiz questions"
  ON public.quiz_questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = quiz_questions.material_id
      AND materials.user_id = auth.uid()
    )
  );

-- Create trigger for updating updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for auto-creating profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for material images
INSERT INTO storage.buckets (id, name, public)
VALUES ('materials', 'materials', true);

-- Storage policies for materials bucket
CREATE POLICY "Users can upload own material images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'materials' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own material images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'materials'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public can view material images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'materials');

CREATE POLICY "Users can delete own material images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'materials'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );