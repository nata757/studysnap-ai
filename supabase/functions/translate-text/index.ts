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
  text: string;
  isManual: boolean;
}

interface I18nData {
  sourceLanguage: SupportedLanguage;
  versions: Partial<Record<SupportedLanguage, LanguageVersion>>;
}

interface NotesData {
  i18n: I18nData;
}

// Parse notes field to get i18n data
function parseI18nData(notes: string | null): I18nData | null {
  if (!notes) return null;
  
  try {
    const parsed = JSON.parse(notes);
    
    // New format
    if (parsed?.i18n?.sourceLanguage && parsed?.i18n?.versions) {
      return parsed.i18n as I18nData;
    }
    
    // Legacy format
    if (parsed?.originalText && parsed?.sourceLanguage && parsed?.translations) {
      const versions: Partial<Record<SupportedLanguage, LanguageVersion>> = {};
      versions[parsed.sourceLanguage as SupportedLanguage] = {
        text: parsed.originalText,
        isManual: true,
      };
      for (const [lang, text] of Object.entries(parsed.translations)) {
        if (text && lang !== parsed.sourceLanguage) {
          versions[lang as SupportedLanguage] = {
            text: text as string,
            isManual: false,
          };
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
    const { materialId, targetLanguage, text, sourceLanguage } = await req.json();

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
        .select('notes, ocr_text')
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
          JSON.stringify({ translatedText: existingVersion.text, isManual: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If target already exists (auto), still proceed to re-translate
      // Get source text to translate from
      const sourceVersion = parsed.versions[actualSourceLanguage];
      if (!sourceVersion?.text) {
        return new Response(
          JSON.stringify({ error: 'Source text not available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      textToTranslate = sourceVersion.text;

      // Same language check
      if (actualSourceLanguage === targetLanguage) {
        return new Response(
          JSON.stringify({ translatedText: textToTranslate }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Translating from ${actualSourceLanguage} to ${targetLanguage}, text length: ${textToTranslate.length}`);

    const sourceLangName = LANGUAGE_NAMES[actualSourceLanguage] || actualSourceLanguage;
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

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
            content: `You are a professional medical translator. Translate the following text from ${sourceLangName} to ${targetLangName}.

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
            content: textToTranslate
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
    const translatedText = data.choices?.[0]?.message?.content || '';

    if (!translatedText) {
      console.error('Empty translation result');
      return new Response(
        JSON.stringify({ error: 'Translation returned empty result' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trimmedTranslation = translatedText.trim();
    console.log(`Translation completed, result length: ${trimmedTranslation.length}`);

    // For new flow, save translation to database
    if (!isLegacyCall && materialId) {
      const updatedVersions = {
        ...i18nData!.versions,
        [targetLanguage]: {
          text: trimmedTranslation,
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
      JSON.stringify({ translatedText: trimmedTranslation, isManual: false }),
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
