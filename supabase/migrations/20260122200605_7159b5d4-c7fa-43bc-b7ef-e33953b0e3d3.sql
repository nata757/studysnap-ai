-- Add photos JSONB column for storing photo metadata with storage paths
ALTER TABLE public.materials
ADD COLUMN photos JSONB DEFAULT '[]'::jsonb;

-- Migrate existing image URLs to the new photos structure
-- For existing records, path will be null (legacy data)
UPDATE public.materials
SET photos = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'url', img,
        'path', NULL,
        'createdAt', created_at
      )
    ),
    '[]'::jsonb
  )
  FROM unnest(images) AS img
)
WHERE images IS NOT NULL AND array_length(images, 1) > 0;

-- Add a comment explaining the structure
COMMENT ON COLUMN public.materials.photos IS 'Array of photo objects: {url: string, path: string | null, createdAt: timestamp}';