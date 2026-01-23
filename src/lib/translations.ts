/**
 * Translation storage utilities
 * 
 * Translations are stored in the `notes` field of materials table as JSON:
 * {
 *   "i18n": {
 *     "sourceLanguage": "ru|de|en",
 *     "versions": {
 *       "ru": { "title": "...", "text": "...", "isManual": true|false },
 *       "de": { "title": "...", "text": "...", "isManual": true|false },
 *       "en": { "title": "...", "text": "...", "isManual": true|false }
 *     }
 *   }
 * }
 */

export type SupportedLanguage = 'ru' | 'de' | 'en';

export interface LanguageVersion {
  title?: string;
  text: string;
  isManual: boolean;
}

export interface I18nData {
  sourceLanguage: SupportedLanguage;
  versions: Partial<Record<SupportedLanguage, LanguageVersion>>;
}

export interface NotesData {
  i18n: I18nData;
}

// Legacy format for migration
interface LegacyTranslationData {
  originalText: string;
  sourceLanguage: SupportedLanguage;
  translations: Partial<Record<SupportedLanguage, string>>;
}

// New format with title translations
interface NewFormatTranslationData {
  originalLanguage: SupportedLanguage;
  originalText: {
    title: string;
    text: string;
  };
  translations: Partial<Record<SupportedLanguage, { title: string; text: string }>>;
}

/**
 * Parse the notes field to extract i18n data
 * Handles new format, current format, and legacy format migration
 */
export function parseI18nData(notes: string | null): I18nData | null {
  if (!notes) return null;
  
  try {
    const parsed = JSON.parse(notes);
    
    // Current format: { i18n: { sourceLanguage, versions } }
    if (parsed?.i18n?.sourceLanguage && parsed?.i18n?.versions) {
      return parsed.i18n as I18nData;
    }
    
    // New proposed format: { originalLanguage, originalText: {title, text}, translations }
    if (parsed?.originalLanguage && parsed?.originalText?.text) {
      return migrateNewFormat(parsed as NewFormatTranslationData);
    }
    
    // Legacy format: { originalText, sourceLanguage, translations }
    if (parsed?.originalText && typeof parsed.originalText === 'string' && parsed?.sourceLanguage) {
      const legacy = parsed as LegacyTranslationData;
      return migrateLegacyFormat(legacy);
    }
    
    return null;
  } catch {
    // Notes field contains plain text or invalid JSON
    return null;
  }
}

/**
 * Migrate new proposed format to i18n format
 */
function migrateNewFormat(data: NewFormatTranslationData): I18nData {
  const versions: Partial<Record<SupportedLanguage, LanguageVersion>> = {};
  
  // Source language version is always manual
  versions[data.originalLanguage] = {
    title: data.originalText.title,
    text: data.originalText.text,
    isManual: true,
  };
  
  // Other translations are auto-generated
  if (data.translations) {
    for (const [lang, content] of Object.entries(data.translations)) {
      if (content && lang !== data.originalLanguage) {
        versions[lang as SupportedLanguage] = {
          title: content.title,
          text: content.text,
          isManual: false,
        };
      }
    }
  }
  
  return {
    sourceLanguage: data.originalLanguage,
    versions,
  };
}

/**
 * Migrate legacy translation format to new i18n format
 */
function migrateLegacyFormat(legacy: LegacyTranslationData): I18nData {
  const versions: Partial<Record<SupportedLanguage, LanguageVersion>> = {};
  
  // Source language version is always manual
  versions[legacy.sourceLanguage] = {
    text: legacy.originalText,
    isManual: true,
  };
  
  // Other translations are auto-generated
  if (legacy.translations) {
    for (const [lang, text] of Object.entries(legacy.translations)) {
      if (text && lang !== legacy.sourceLanguage) {
        versions[lang as SupportedLanguage] = {
          text,
          isManual: false,
        };
      }
    }
  }
  
  return {
    sourceLanguage: legacy.sourceLanguage,
    versions,
  };
}

/**
 * Serialize i18n data to store in notes field
 */
export function serializeI18nData(data: I18nData): string {
  return JSON.stringify({ i18n: data });
}

/**
 * Create initial i18n data structure from source text and optional title
 */
export function createI18nData(
  sourceText: string,
  sourceLanguage: SupportedLanguage,
  sourceTitle?: string
): I18nData {
  return {
    sourceLanguage,
    versions: {
      [sourceLanguage]: {
        ...(sourceTitle && { title: sourceTitle }),
        text: sourceText,
        isManual: true,
      },
    },
  };
}

/**
 * Add or update a translation version (text only)
 * Will NOT overwrite if existing version is manual and new is auto
 */
export function setVersion(
  data: I18nData,
  language: SupportedLanguage,
  text: string,
  isManual: boolean
): I18nData {
  const existing = data.versions[language];
  
  // Never overwrite manual with auto
  if (existing?.isManual && !isManual) {
    return data;
  }
  
  return {
    ...data,
    versions: {
      ...data.versions,
      [language]: { 
        ...existing,
        text, 
        isManual,
      },
    },
  };
}

/**
 * Add or update a full translation version (title + text)
 * Will NOT overwrite if existing version is manual and new is auto
 */
export function setFullVersion(
  data: I18nData,
  language: SupportedLanguage,
  title: string,
  text: string,
  isManual: boolean
): I18nData {
  const existing = data.versions[language];
  
  // Never overwrite manual with auto
  if (existing?.isManual && !isManual) {
    return data;
  }
  
  return {
    ...data,
    versions: {
      ...data.versions,
      [language]: { title, text, isManual },
    },
  };
}

/**
 * Update only the title for a language version
 */
export function setTitle(
  data: I18nData,
  language: SupportedLanguage,
  title: string,
  isManual: boolean
): I18nData {
  const existing = data.versions[language];
  
  // If no existing version, create one with empty text
  if (!existing) {
    return {
      ...data,
      versions: {
        ...data.versions,
        [language]: { title, text: '', isManual },
      },
    };
  }
  
  // For title-only updates on existing versions, preserve text and update isManual if setting manually
  return {
    ...data,
    versions: {
      ...data.versions,
      [language]: { 
        ...existing, 
        title,
        isManual: isManual || existing.isManual,
      },
    },
  };
}

/**
 * Get text in a specific language (falls back to source if not available)
 */
export function getTextInLanguage(
  data: I18nData | null,
  language: SupportedLanguage
): string {
  if (!data) return '';
  
  const version = data.versions[language];
  if (version?.text) return version.text;
  
  // Fallback to source language
  const sourceVersion = data.versions[data.sourceLanguage];
  return sourceVersion?.text || '';
}

/**
 * Get title in a specific language (falls back to source if not available)
 */
export function getTitleInLanguage(
  data: I18nData | null,
  language: SupportedLanguage
): string {
  if (!data) return '';
  
  const version = data.versions[language];
  if (version?.title) return version.title;
  
  // Fallback to source language
  const sourceVersion = data.versions[data.sourceLanguage];
  return sourceVersion?.title || '';
}

/**
 * Check if a version exists for a language
 */
export function hasVersion(
  data: I18nData | null,
  language: SupportedLanguage
): boolean {
  if (!data) return false;
  return !!data.versions[language]?.text;
}

/**
 * Check if a title version exists for a language
 */
export function hasTitleVersion(
  data: I18nData | null,
  language: SupportedLanguage
): boolean {
  if (!data) return false;
  return !!data.versions[language]?.title;
}

/**
 * Check if a version is manual (user-edited)
 */
export function isVersionManual(
  data: I18nData | null,
  language: SupportedLanguage
): boolean {
  if (!data) return false;
  return data.versions[language]?.isManual ?? false;
}

/**
 * Get all available languages for a material
 */
export function getAvailableLanguages(data: I18nData | null): SupportedLanguage[] {
  if (!data) return [];
  return Object.keys(data.versions).filter(
    (key): key is SupportedLanguage => 
      ['ru', 'de', 'en'].includes(key) && !!data.versions[key as SupportedLanguage]?.text
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
 * Short language codes for display
 */
export const LANGUAGE_CODES: Record<SupportedLanguage, string> = {
  ru: 'RU',
  de: 'DE',
  en: 'EN',
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

// ============================================
// LEGACY EXPORTS - for backward compatibility
// These map to the new functions
// ============================================

export type TranslationData = I18nData;

export function parseTranslationData(notes: string | null): I18nData | null {
  return parseI18nData(notes);
}

export function serializeTranslationData(data: I18nData): string {
  return serializeI18nData(data);
}

export function createTranslationData(
  originalText: string,
  sourceLanguage: SupportedLanguage,
  originalTitle?: string
): I18nData {
  return createI18nData(originalText, sourceLanguage, originalTitle);
}

export function setTranslation(
  data: I18nData,
  language: SupportedLanguage,
  text: string
): I18nData {
  // When called from old code, treat as auto-translation
  return setVersion(data, language, text, false);
}

export function hasTranslation(
  data: I18nData | null,
  language: SupportedLanguage
): boolean {
  return hasVersion(data, language);
}
