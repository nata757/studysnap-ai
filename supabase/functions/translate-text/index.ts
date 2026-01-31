
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LANGUAGE_NAMES: Record<string, string> = {
  ru: "Russian",
  de: "German",
  en: "English",
};

type SupportedLanguage = "ru" | "de" | "en";

interface LanguageVersion {
  title?: string;
  text: string;
  isManual: boolean;
}

interface I18nData {
  sourceLanguage: SupportedLanguage;
  versions: Partial<Record<SupportedLanguage, LanguageVersion>>;
}

/** -----------------------------
 *  Унифицированные ответы (ВАЖНО)
 *  -----------------------------
 *  Всегда возвращаем HTTP 200 для ошибок бизнес-логики,
 *  чтобы supabase.functions.invoke не ломал фронт на Android.
 */

function jsonOk(data: unknown) {
  return new Response(
    JSON.stringify({ success: true, code: "OK", message: null, data }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

function jsonFail(params: {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}) {
  return new Response(
    JSON.stringify({
      success: false,
      code: params.code,
      message: params.message,
      status: params.status ?? 200,
      details: params.details ?? null,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

function mapAiStatusToCode(status: number) {
  if (status === 402) return "CREDITS_EXHAUSTED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status >= 500) return "AI_UPSTREAM_ERROR";
  return "AI_REQUEST_FAILED";
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
    if (
      parsed?.originalText && typeof parsed.originalText === "string" &&
      parsed?.sourceLanguage
    ) {
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const materialId = body.materialId;
    const targetLanguage = body.targetLanguage as SupportedLanguage | undefined;

    const text = body.text as string | undefined;
    const sourceLanguage = body.sourceLanguage as SupportedLanguage | undefined;

    const includeTitle = body.includeTitle === true;

    // Support both new (materialId) and legacy (text+sourceLanguage) calls
    const isLegacyCall = !materialId && !!text && !!sourceLanguage;

    if (!isLegacyCall && !materialId) {
      console.error("Missing materialId");
      return jsonFail({
        code: "BAD_REQUEST",
        message: "Missing required field: materialId",
        status: 400,
      });
    }

    if (!targetLanguage) {
      console.error("Missing targetLanguage");
      return jsonFail({
        code: "BAD_REQUEST",
        message: "Missing required field: targetLanguage",
        status: 400,
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return jsonFail({
        code: "CONFIG_MISSING",
        message: "OPENAI_API_KEY not configured",
        status: 500,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("Supabase env vars not configured");
      return jsonFail({
        code: "CONFIG_MISSING",
        message: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured",
        status: 500,
      });
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    let i18nData: I18nData | null = null;
    let actualSourceLanguage: SupportedLanguage;
    let textToTranslate: string;
    let titleToTranslate: string | undefined;
    const shouldTranslateTitle = includeTitle === true;

    if (isLegacyCall) {
      // Legacy call - use provided text and source
      textToTranslate = text!;
      actualSourceLanguage = sourceLanguage!;

      // Same language - return as-is
      if (actualSourceLanguage === targetLanguage) {
        return jsonOk({
          translatedText: textToTranslate,
          translatedTitle: undefined,
          isManual: true,
        });
      }
    } else {
      // New flow - fetch material and check i18n data
      const { data: material, error: fetchError } = await supabase
        .from("materials")
        .select("notes, ocr_text, title")
        .eq("id", materialId)
        .single();

      if (fetchError || !material) {
        console.error("Material not found:", fetchError);
        return jsonFail({
          code: "NOT_FOUND",
          message: "Material not found",
          status: 404,
          details: fetchError ?? null,
        });
      }

      const parsed = parseI18nData(material.notes);

      if (!parsed) {
        console.error("No i18n data in material");
        return jsonFail({
          code: "NO_I18N_DATA",
          message: "No translation data available",
          status: 400,
        });
      }

      i18nData = parsed;
      actualSourceLanguage = parsed.sourceLanguage;

      // Check if target version exists and is manual - don't overwrite
      const existingVersion = parsed.versions[targetLanguage];
      if (existingVersion?.isManual) {
        console.log("Version is manual, returning existing text");
        return jsonOk({
          translatedText: existingVersion.text,
          translatedTitle: existingVersion.title,
          isManual: true,
        });
      }

      // Get source text to translate from
      const sourceVersion = parsed.versions[actualSourceLanguage];
      if (!sourceVersion?.text) {
        return jsonFail({
          code: "SOURCE_TEXT_MISSING",
          message: "Source text not available",
          status: 400,
        });
      }

      textToTranslate = sourceVersion.text;

      // Get title if we should translate it
      if (shouldTranslateTitle) {
        titleToTranslate = sourceVersion.title || material.title;
      }

      // Same language check
      if (actualSourceLanguage === targetLanguage) {
        return jsonOk({
          translatedText: textToTranslate,
          translatedTitle: titleToTranslate,
          isManual: true,
        });
      }
    }

    console.log(
      `Translating from ${actualSourceLanguage} to ${targetLanguage}, text length: ${textToTranslate.length}, includeTitle: ${shouldTranslateTitle}`,
    );

    const sourceLangName =
      LANGUAGE_NAMES[actualSourceLanguage] || actualSourceLanguage;
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    // Prepare content for translation
    let contentToTranslate = textToTranslate;
    if (shouldTranslateTitle && titleToTranslate) {
      contentToTranslate =
        `TITLE: ${titleToTranslate}\n\nCONTENT:\n${textToTranslate}`;
    }

    const systemPrompt = shouldTranslateTitle
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
6. Preserve formatting markers like [unclear] as-is`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contentToTranslate },
        ],
        max_tokens: 8192,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("AI error:", response.status, errorText);

      return jsonFail({
        code: mapAiStatusToCode(response.status),
        message: "Translation failed",
        status: response.status,
        details: errorText,
      });
    }

    const aiJson = await response.json().catch(() => null);
    const rawResult = aiJson?.choices?.[0]?.message?.content || "";

    if (!rawResult) {
      console.error("Empty translation result");
      return jsonFail({
        code: "EMPTY_RESULT",
        message: "Translation returned empty result",
        status: 500,
        details: aiJson,
      });
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

    console.log(
      `Translation completed, text length: ${translatedText.length}${
        translatedTitle ? `, title: "${translatedTitle}"` : ""
      }`,
    );

    // For new flow, save translation to database
    if (!isLegacyCall && materialId && i18nData) {
      const updatedVersions = {
        ...i18nData.versions,
        [targetLanguage]: {
          ...(translatedTitle ? { title: translatedTitle } : {}),
          text: translatedText,
          isManual: false,
        },
      };

      const updatedNotes = JSON.stringify({
        i18n: {
          sourceLanguage: i18nData.sourceLanguage,
          versions: updatedVersions,
        },
      });

      const { error: updateError } = await supabase
        .from("materials")
        .update({ notes: updatedNotes })
        .eq("id", materialId);

      if (updateError) {
        console.error("Failed to save translation:", updateError);
        // Всё равно вернём перевод, просто скажем в details, что сохранение не удалось
        return jsonOk({
          translatedText,
          translatedTitle,
          isManual: false,
          saved: false,
          saveError: updateError,
        });
      } else {
        console.log("Translation saved to database");
      }
    }

    return jsonOk({
      translatedText,
      translatedTitle,
      isManual: false,
    });
  } catch (error) {
    console.error("Translation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return jsonFail({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      status: 500,
      details: errorMessage,
    });
  }
});
