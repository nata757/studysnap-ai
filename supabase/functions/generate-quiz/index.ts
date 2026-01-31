import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type I18nNotes = {
  i18n?: {
    sourceLanguage?: string;
    versions?: Record<string, { title?: string; text?: string; isManual?: boolean }>;
  };
  originalText?: { title?: string; text?: string };
  text?: string;
  title?: string;
  ocr_text?: string;
};

/** -----------------------------
 *  Унифицированные ответы
 *  Всегда 200, чтобы фронт не ломался из-за non-2xx.
 *  -----------------------------
 */
function jsonOk(data: unknown) {
  return new Response(
    JSON.stringify({ success: true, code: "OK", message: null, data }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function jsonFail(params: { code: string; message: string; status?: number; details?: unknown }) {
  return new Response(
    JSON.stringify({
      success: false,
      code: params.code,
      message: params.message,
      status: params.status ?? 200,
      details: params.details ?? null,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function safeTrim(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function pickTextFromNotes(
  notes: any,
  language: string,
): { text: string | null; title: string | null; sourceLanguage: string | null } {
  const n: I18nNotes | null = notes && typeof notes === "object" ? notes : null;

  const sourceLanguage =
    (typeof n?.i18n?.sourceLanguage === "string" ? n?.i18n?.sourceLanguage : null);

  const v = n?.i18n?.versions?.[language];

  const text =
    safeTrim(v?.text) ??
    safeTrim(n?.originalText?.text) ??
    safeTrim(n?.text) ??
    safeTrim((n as any)?.ocr_text) ??
    null;

  const title =
    safeTrim(v?.title) ??
    safeTrim(n?.originalText?.title) ??
    safeTrim(n?.title) ??
    null;

  return { text, title, sourceLanguage };
}

function extractToolArgs(data: any): any {
  const msg = data?.choices?.[0]?.message;

  // New format: tool_calls
  let args = msg?.tool_calls?.[0]?.function?.arguments ?? null;

  // Old format: function_call
  if (!args) args = msg?.function_call?.arguments ?? null;

  if (!args) {
    throw new Error("No tool/function call arguments in AI response");
  }

  // Sometimes already object
  if (typeof args === "object") return args;

  if (typeof args !== "string") {
    throw new Error("Unexpected tool arguments type");
  }

  try {
    return JSON.parse(args);
  } catch {
    const preview = args.length > 800 ? args.slice(0, 800) + "..." : args;
    throw new Error("Failed to parse AI tool arguments JSON. Preview: " + preview);
  }
}

function mapAiStatusToCode(status: number) {
  if (status === 402) return "CREDITS_EXHAUSTED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status >= 500) return "AI_UPSTREAM_ERROR";
  return "AI_REQUEST_FAILED";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    // Preflight can be 204 as usual
    return new Response("ok", { status: 204, headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const {
      material_id,
      ocr_text,
      title: reqTitle,
      topic,
      count = 8,
      language = "ru",
    } = payload ?? {};

    if (!material_id) {
      return jsonFail({ code: "BAD_REQUEST", message: "material_id is required", status: 400 });
    }

    // Supabase env + client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return jsonFail({
        code: "CONFIG_MISSING",
        message: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured",
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1) Prefer explicit ocr_text if passed, else load from materials.notes (i18n)
    let sourceText = safeTrim(ocr_text);
    let sourceTitle = safeTrim(reqTitle);

    if (!sourceText) {
      const { data: material, error: matErr } = await supabase
        .from("materials")
        .select("notes")
        .eq("id", material_id)
        .maybeSingle();

      if (matErr) {
        console.error("[Quiz] Failed to load material:", matErr);
        return jsonFail({
          code: "DB_READ_FAILED",
          message: "Failed to load material",
          status: 500,
          details: matErr,
        });
      }

      const picked = pickTextFromNotes(material?.notes, language);
      sourceText = picked.text;
      if (!sourceTitle) sourceTitle = picked.title;

      console.log("[Quiz] Loaded text from DB", {
        material_id,
        language,
        hasText: !!sourceText,
        textLen: sourceText?.length ?? 0,
        hasTitle: !!sourceTitle,
        sourceLanguage: picked.sourceLanguage ?? null,
      });
    } else {
      console.log("[Quiz] Using ocr_text from request", {
        material_id,
        language,
        textLen: sourceText.length,
      });
    }

    if (!sourceText) {
      return jsonFail({
        code: "NO_SOURCE_TEXT",
        message: `No text found for material_id=${material_id} lang=${language}`,
        status: 400,
      });
    }

    // Lovable AI Gateway key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonFail({
        code: "CONFIG_MISSING",
        message: "LOVABLE_API_KEY not configured",
        status: 500,
      });
    }

    // Prompts
    const systemPrompt = `You are an AI assistant for medical students preparing for exams.
Your task is to create multiple-choice quiz questions for exam practice.

IMPORTANT:
Generate questions and explanations strictly in language: ${language}.

CRITICAL RULES:
1. ONLY use information explicitly stated in the provided text.
2. If the text is missing info, ask simpler questions and set confidence low.
3. Each question must have exactly 4 options.
4. correctIndex must be 0-3.
5. Return output ONLY via the tool call.

Create exactly ${count} questions.`;

    const userPrompt = `Create ${count} multiple-choice quiz questions from this lecture material:

${sourceTitle ? `Title: ${sourceTitle}\n` : ""}${topic ? `Topic: ${topic}\n` : ""}

LECTURE TEXT:
${sourceText}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_quiz",
              description: "Generate multiple-choice quiz questions",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string", description: "The question text" },
                        options: {
                          type: "array",
                          items: { type: "string" },
                          description: "Exactly 4 answer options",
                        },
                        correctIndex: {
                          type: "number",
                          description: "Index of correct answer (0-3)",
                        },
                        explanation: { type: "string", description: "Why the correct answer is right" },
                        confidence: {
                          type: "string",
                          enum: ["high", "medium", "low"],
                          description: "Confidence based on source clarity",
                        },
                      },
                      required: ["question", "options", "correctIndex", "explanation", "confidence"],
                      additionalProperties: false,
                    },
                  },
                  warnings: {
                    type: "array",
                    items: { type: "string" },
                    description: "Any issues or unclear content",
                  },
                },
                required: ["questions", "warnings"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_quiz" } },
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text().catch(() => "");
      console.error("[Quiz] AI error:", aiResp.status, errorText);

      return jsonFail({
        code: mapAiStatusToCode(aiResp.status),
        message: "Quiz generation failed",
        status: aiResp.status,
        details: errorText,
      });
    }

    const data = await aiResp.json().catch(() => null);
    if (!data) {
      return jsonFail({
        code: "AI_BAD_RESPONSE",
        message: "Failed to parse AI JSON response",
        status: 500,
      });
    }

    let quizData: any;
    try {
      quizData = extractToolArgs(data);
    } catch (e) {
      console.error("[Quiz] Tool args parse error:", e);
      console.error("[Quiz] Raw AI response:", JSON.stringify(data));
      return jsonFail({
        code: "AI_INVALID_FORMAT",
        message: "Invalid AI response format",
        status: 500,
        details: (e instanceof Error ? e.message : String(e)),
      });
    }

    const questions = Array.isArray(quizData?.questions) ? quizData.questions : [];
    console.log("[Quiz] Parsed questions:", questions.length);

    if (!questions.length) {
      return jsonFail({
        code: "AI_EMPTY_QUESTIONS",
        message: "AI returned no questions",
        status: 500,
        details: quizData ?? null,
      });
    }

    // Delete existing for material + language
    const delRes = await supabase
      .from("quiz_questions")
      .delete()
      .eq("material_id", material_id)
      .eq("language", language);

    if (delRes.error) {
      console.error("[Quiz] Delete error:", delRes.error);
      return jsonFail({
        code: "DB_DELETE_FAILED",
        message: "Failed to clear old quiz questions",
        status: 500,
        details: delRes.error,
      });
    }

    // Insert
    const questionsToInsert = questions.map((q: any) => ({
      material_id,
      question: q.question,
      options: q.options,
      correct_index: q.correctIndex,
      explanation: q.explanation,
      confidence: q.confidence,
      language,
    }));

    const { data: inserted, error: insErr } = await supabase
      .from("quiz_questions")
      .insert(questionsToInsert)
      .select();

    if (insErr) {
      console.error("[Quiz] Insert error:", insErr);
      return jsonFail({
        code: "DB_INSERT_FAILED",
        message: "Failed to save quiz questions",
        status: 500,
        details: insErr,
      });
    }

    return jsonOk({
      questions: inserted,
      warnings: quizData?.warnings || [],
    });
  } catch (error) {
    console.error("[Quiz] Unhandled error:", error);
    return jsonFail({
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      status: 500,
      details: error,
    });
  }
});
