import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'Russian',
  de: 'German',
  en: 'English',
};

type SupportedLanguage = 'ru' | 'de' | 'en';

interface LanguageVersion {
  title?: string;
  text: string;
  isManual: boolean;
}

interface I18nData {
  sourceLanguage: SupportedLanguage;
  versions: Partial<Record<SupportedLanguage, LanguageVersion>>;
}

// Parse notes field to get i18n data
function parseI18nData(notes: string | null): I18nData | null {
  if (!notes) return null;
  
  try {
    const parsed = JSON.parse(notes);
    
    // Current format: { i18n: { sourceLanguage, versions } }
    if (parsed?.i18n?.sourceLanguage && parsed?.i18n?.versions) {
      return parsed.i18n as I18nData;
    }
    
    // New proposed format: { originalLanguage, originalText: {title, text}, translations }
    if (parsed?.originalLanguage && parsed?.originalText?.text) {
      const versions: Partial<Record<SupportedLanguage, LanguageVersion>> = {};
      versions[parsed.originalLanguage as SupportedLanguage] = {
        title: parsed.originalText.title,
        text: parsed.originalText.text,
        isManual: true,
      };
      if (parsed.translations) {
        for (const [lang, content] of Object.entries(parsed.translations)) {
          if (content && lang !== parsed.originalLanguage) {
            const c = content as { title: string; text: string };
            versions[lang as SupportedLanguage] = {
              title: c.title,
              text: c.text,
              isManual: false,
            };
          }
        }
      }
      return {
        sourceLanguage: parsed.originalLanguage,
        versions,
      };
    }
    
    // Legacy format: { originalText (string), sourceLanguage, translations }
    if (parsed?.originalText && typeof parsed.originalText === 'string' && parsed?.sourceLanguage) {
      const versions: Partial<Record<SupportedLanguage, LanguageVersion>> = {};
      versions[parsed.sourceLanguage as SupportedLanguage] = {
        text: parsed.originalText,
        isManual: true,
      };
      if (parsed.translations) {
        for (const [lang, text] of Object.entries(parsed.translations)) {
          if (text && lang !== parsed.sourceLanguage) {
            versions[lang as SupportedLanguage] = {
              text: text as string,
              isManual: false,
            };
          }
        }
      }
      return {
        sourceLanguage: parsed.sourceLanguage,
        versions,
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { materialId, targetLanguage, text, sourceLanguage, includeTitle } = await req.json();

    // Support both new (materialId) and legacy (text+sourceLanguage) calls
    const isLegacyCall = !materialId && text && sourceLanguage;
    
    if (!isLegacyCall && !materialId) {
      console.error('Missing materialId');
      return new Response(
        JSON.stringify({ error: 'Missing required field: materialId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!targetLanguage) {
      console.error('Missing targetLanguage');
      return new Response(
        JSON.stringify({ error: 'Missing required field: targetLanguage' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let i18nData: I18nData;
    let actualSourceLanguage: SupportedLanguage;
    let textToTranslate: string;
    let titleToTranslate: string | undefined;
    let shouldTranslateTitle = includeTitle === true;

    if (isLegacyCall) {
      // Legacy call - use provided text and source
      textToTranslate = text;
      actualSourceLanguage = sourceLanguage;
      
      // Same language - return as-is
      if (sourceLanguage === targetLanguage) {
        return new Response(
          JSON.stringify({ translatedText: text }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // New flow - fetch material and check i18n data
      const { data: material, error: fetchError } = await supabase
        .from('materials')
        .select('notes, ocr_text, title')
        .eq('id', materialId)
        .single();

      if (fetchError || !material) {
        console.error('Material not found:', fetchError);
        return new Response(
          JSON.stringify({ error: 'Material not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const parsed = parseI18nData(material.notes);
      
      if (!parsed) {
        console.error('No i18n data in material');
        return new Response(
          JSON.stringify({ error: 'No translation data available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      i18nData = parsed;
      actualSourceLanguage = parsed.sourceLanguage;

      // Check if target version exists and is manual - don't overwrite
      const existingVersion = parsed.versions[targetLanguage as SupportedLanguage];
      if (existingVersion?.isManual) {
        console.log('Version is manual, returning existing text');
        return new Response(
          JSON.stringify({ 
            translatedText: existingVersion.text, 
            translatedTitle: existingVersion.title,
            isManual: true 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get source text to translate from
      const sourceVersion = parsed.versions[actualSourceLanguage];
      if (!sourceVersion?.text) {
        return new Response(
          JSON.stringify({ error: 'Source text not available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      textToTranslate = sourceVersion.text;
      
      // Get title if we should translate it
      if (shouldTranslateTitle) {
        titleToTranslate = sourceVersion.title || material.title;
      }

      // Same language check
      if (actualSourceLanguage === targetLanguage) {
        return new Response(
          JSON.stringify({ 
            translatedText: textToTranslate,
            translatedTitle: titleToTranslate 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Translating from ${actualSourceLanguage} to ${targetLanguage}, text length: ${textToTranslate.length}, includeTitle: ${shouldTranslateTitle}`);

    const sourceLangName = LANGUAGE_NAMES[actualSourceLanguage] || actualSourceLanguage;
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    // Prepare content for translation
    let contentToTranslate = textToTranslate;
    if (shouldTranslateTitle && titleToTranslate) {
      contentToTranslate = `TITLE: ${titleToTranslate}\n\nCONTENT:\n${textToTranslate}`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: shouldTranslateTitle 
              ? `You are a professional medical translator. Translate the following text from ${sourceLangName} to ${targetLangName}.

The input has this format:
TITLE: [title text]

CONTENT:
[main content]

You MUST return your response in this EXACT format:
TITLE: [translated title]

CONTENT:
[translated content]

RULES:
1. Preserve ALL medical terminology accurately
2. Keep the original text structure (paragraphs, bullet points, numbering)
3. Maintain abbreviations in their common form for the target language
4. If a term has no direct translation, keep the original with a translation in parentheses
5. Return ONLY the translated text in the format above, no explanations
6. Preserve formatting markers like [unclear] as-is`
              : `You are a professional medical translator. Translate the following text from ${sourceLangName} to ${targetLangName}.

RULES:
1. Preserve ALL medical terminology accurately
2. Keep the original text structure (paragraphs, bullet points, numbering)
3. Maintain abbreviations in their common form for the target language
4. If a term has no direct translation, keep the original with a translation in parentheses
5. Return ONLY the translated text, no explanations or notes
6. Preserve formatting markers like [unclear] as-is`
          },
          {
            role: 'user',
            content: contentToTranslate
          }
        ],
        max_tokens: 8192,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Translation failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const rawResult = data.choices?.[0]?.message?.content || '';

    if (!rawResult) {
      console.error('Empty translation result');
      return new Response(
        JSON.stringify({ error: 'Translation returned empty result' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let translatedText: string;
    let translatedTitle: string | undefined;

    // Parse the result based on whether we requested title translation
    if (shouldTranslateTitle && titleToTranslate) {
      const titleMatch = rawResult.match(/TITLE:\s*(.+?)(?:\n\n|$)/s);
      const contentMatch = rawResult.match(/CONTENT:\s*(.+)/s);
      
      translatedTitle = titleMatch?.[1]?.trim();
      translatedText = contentMatch?.[1]?.trim() || rawResult.trim();
    } else {
      translatedText = rawResult.trim();
    }

    console.log(`Translation completed, text length: ${translatedText.length}${translatedTitle ? `, title: "${translatedTitle}"` : ''}`);

    // For new flow, save translation to database
    if (!isLegacyCall && materialId) {
      const updatedVersions = {
        ...i18nData!.versions,
        [targetLanguage]: {
          ...(translatedTitle && { title: translatedTitle }),
          text: translatedText,
          isManual: false,
        },
      };

      const updatedNotes = JSON.stringify({
        i18n: {
          sourceLanguage: i18nData!.sourceLanguage,
          versions: updatedVersions,
        },
      });

      const { error: updateError } = await supabase
        .from('materials')
        .update({ notes: updatedNotes })
        .eq('id', materialId);

      if (updateError) {
        console.error('Failed to save translation:', updateError);
        // Still return the translation even if save failed
      } else {
        console.log('Translation saved to database');
      }
    }

    return new Response(
      JSON.stringify({ 
        translatedText, 
        translatedTitle,
        isManual: false 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Translation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
