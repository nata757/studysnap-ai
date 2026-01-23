/**
 * Translation storage utilities
 * 
 * Translations are stored in the `notes` field of materials table as JSON:
 * {
 *   originalText: "source OCR text",
 *   sourceLanguage: "de" | "en" | "ru",
 *   translations: {
 *     ru: "translated text...",
 *     de: "translated text...",
 *     en: "translated text..."
 *   }
 * }
 */

export type SupportedLanguage = 'ru' | 'de' | 'en';

export interface TranslationData {
  originalText: string;
  sourceLanguage: SupportedLanguage;
  translations: Partial<Record<SupportedLanguage, string>>;
}

/**
 * Parse the notes field to extract translation data
 */
export function parseTranslationData(notes: string | null): TranslationData | null {
  if (!notes) return null;
  
  try {
    const parsed = JSON.parse(notes);
    // Validate structure
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.originalText === 'string' &&
      typeof parsed.sourceLanguage === 'string' &&
      typeof parsed.translations === 'object'
    ) {
      return parsed as TranslationData;
    }
    return null;
  } catch {
    // Notes field contains plain text or invalid JSON
    return null;
  }
}

/**
 * Serialize translation data to store in notes field
 */
export function serializeTranslationData(data: TranslationData): string {
  return JSON.stringify(data);
}

/**
 * Create initial translation data structure
 */
export function createTranslationData(
  originalText: string,
  sourceLanguage: SupportedLanguage
): TranslationData {
  return {
    originalText,
    sourceLanguage,
    translations: {
      [sourceLanguage]: originalText, // Source language always has original text
    },
  };
}

/**
 * Add or update a translation
 */
export function setTranslation(
  data: TranslationData,
  language: SupportedLanguage,
  text: string
): TranslationData {
  return {
    ...data,
    translations: {
      ...data.translations,
      [language]: text,
    },
  };
}

/**
 * Get text in a specific language (falls back to original if not available)
 */
export function getTextInLanguage(
  data: TranslationData | null,
  language: SupportedLanguage
): string {
  if (!data) return '';
  return data.translations[language] || data.originalText;
}

/**
 * Check if a translation exists for a language
 */
export function hasTranslation(
  data: TranslationData | null,
  language: SupportedLanguage
): boolean {
  if (!data) return false;
  return !!data.translations[language];
}

/**
 * Get all available languages for a material
 */
export function getAvailableLanguages(data: TranslationData | null): SupportedLanguage[] {
  if (!data) return [];
  return Object.keys(data.translations).filter(
    (key): key is SupportedLanguage => 
      ['ru', 'de', 'en'].includes(key) && !!data.translations[key as SupportedLanguage]
  );
}

/**
 * Language display names
 */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  ru: 'Русский',
  de: 'Deutsch',
  en: 'English',
};

/**
 * Detect likely source language from text (simple heuristic)
 */
export function detectSourceLanguage(text: string): SupportedLanguage {
  // Check for Cyrillic characters (Russian)
  const cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  // Check for German-specific characters
  const germanCount = (text.match(/[äöüßÄÖÜ]/g) || []).length;
  
  const totalChars = text.length;
  
  if (cyrillicCount > totalChars * 0.1) {
    return 'ru';
  }
  if (germanCount > totalChars * 0.01) {
    return 'de';
  }
  return 'en';
}
