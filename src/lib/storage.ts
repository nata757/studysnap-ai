import { supabase } from '@/integrations/supabase/client';

export interface PhotoData {
  url: string;
  path: string | null;
  createdAt: string;
}

/**
 * Upload a base64 image to Supabase storage with proper path structure
 * Path format: users/{userId}/materials/{materialId}/{uuid}.jpg
 */
export async function uploadPhoto(
  base64Image: string,
  userId: string,
  materialId: string
): Promise<PhotoData | null> {
  try {
    // Extract base64 data
    const base64Data = base64Image.split(',')[1];
    if (!base64Data) return null;

    // Generate unique filename
    const uuid = crypto.randomUUID();
    const path = `users/${userId}/materials/${materialId}/${uuid}.jpg`;

    // Convert base64 to blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let j = 0; j < byteCharacters.length; j++) {
      byteNumbers[j] = byteCharacters.charCodeAt(j);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('materials')
      .upload(path, blob);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('materials')
      .getPublicUrl(path);

    if (!urlData?.publicUrl) return null;

    return {
      url: urlData.publicUrl,
      path,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Upload photo error:', err);
    return null;
  }
}

/**
 * Delete a photo from storage using its path
 */
export async function deletePhoto(path: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('materials')
      .remove([path]);

    if (error) {
      console.warn('Storage deletion failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Delete photo error:', err);
    return false;
  }
}

/**
 * Delete multiple photos from storage, returning results for each
 */
export async function deletePhotosWithResults(
  paths: string[]
): Promise<{ succeeded: string[]; failed: string[] }> {
  const validPaths = paths.filter((p): p is string => p !== null && p.length > 0);
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const path of validPaths) {
    const success = await deletePhoto(path);
    if (success) {
      succeeded.push(path);
    } else {
      failed.push(path);
    }
  }

  return { succeeded, failed };
}

/**
 * Delete multiple photos from storage (fire and forget)
 * @deprecated Use deletePhotosWithResults for better error handling
 */
export async function deletePhotos(paths: string[]): Promise<void> {
  const validPaths = paths.filter((p): p is string => p !== null && p.length > 0);
  if (validPaths.length === 0) return;

  try {
    await supabase.storage.from('materials').remove(validPaths);
  } catch (err) {
    console.error('Batch delete photos error:', err);
  }
}

/**
 * Create a draft material record to get a materialId before uploading photos
 */
export async function createDraftMaterial(
  userId: string,
  topic: string = 'Sonstiges'
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('materials')
      .insert({
        user_id: userId,
        topic,
        title: null,
        tags: [],
        ocr_text: null,
        images: [],
        photos: [],
      })
      .select('id')
      .single();

    if (error) {
      console.error('Create draft material error:', error);
      return null;
    }

    return data.id;
  } catch (err) {
    console.error('Create draft material error:', err);
    return null;
  }
}
