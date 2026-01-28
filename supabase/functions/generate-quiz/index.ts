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
    versions?: Record<
      string,
      { title?: string; text?: string; isManual?: boolean }
    >;
  };
  originalText?: { title?: string; text?: string };
  text?: string;
  title?: string;
  ocr_text?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeTrim(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function pickTextFromNotes(notes: any, language: string): { text: string | null; title: string | null; sourceLanguage: string | null } {
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
    // Helpful for debugging broken JSON from models
    const preview = args.length > 800 ? args.slice(0, 800) + "..." : args;
    throw new Error("Failed to parse AI tool arguments JSON. Preview: " + preview);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
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
      return jsonResponse({ error: "material_id is required" }, 400);
    }

    // Supabase env + client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: "Supabase env not configured" }, 500);
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
        return jsonResponse({ error: "Failed to load material" }, 500);
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
      return jsonResponse(
        { error: `No text found for material_id=${material_id} lang=${language}` },
        400,
      );
    }

    // Lovable AI Gateway key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "API key not configured" }, 500);
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

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
                          question: {
                            type: "string",
                            description: "The question text",
                          },
                          options: {
                            type: "array",
                            items: { type: "string" },
                            description: "Exactly 4 answer options",
                          },
                          correctIndex: {
                            type: "number",
                            description: "Index of correct answer (0-3)",
                          },
                          explanation: {
                            type: "string",
                            description: "Why the correct answer is right",
                          },
                          confidence: {
                            type: "string",
                            enum: ["high", "medium", "low"],
                            description: "Confidence based on source clarity",
                          },
                        },
                        required: [
                          "question",
                          "options",
                          "correctIndex",
                          "explanation",
                          "confidence",
                        ],
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
      },
    );

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("[Quiz] AI Gateway error:", aiResp.status, errorText);

      if (aiResp.status === 429) {
        return jsonResponse(
          { error: "Rate limit exceeded. Please try again later." },
          429,
        );
      }
      if (aiResp.status === 402) {
        return jsonResponse(
          { error: "AI credits exhausted. Please add funds." },
          402,
        );
      }

      // временно добавляем details, чтобы не гадать
      return jsonResponse(
        { error: "Quiz generation failed", details: errorText },
        500,
      );
    }

    const data = await aiResp.json();
    let quizData: any;
    try {
      quizData = extractToolArgs(data);
    } catch (e) {
      console.error("[Quiz] Tool args parse error:", e);
      console.error("[Quiz] Raw AI response:", JSON.stringify(data));
      return jsonResponse({ error: "Invalid AI response format" }, 500);
    }

    const questions = Array.isArray(quizData?.questions) ? quizData.questions : [];
    console.log("[Quiz] Parsed questions:", questions.length);

    if (!questions.length) {
      return jsonResponse(
        { error: "AI returned no questions", raw: quizData ?? null },
        500,
      );
    }

    // Delete existing for material + language
    const delRes = await supabase
      .from("quiz_questions")
      .delete()
      .eq("material_id", material_id)
      .eq("language", language);

    if (delRes.error) {
      console.error("[Quiz] Delete error:", delRes.error);
      return jsonResponse({ error: "Failed to clear old quiz questions" }, 500);
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
      return jsonResponse({ error: "Failed to save quiz questions" }, 500);
    }

    return jsonResponse({
      questions: inserted,
      warnings: quizData?.warnings || [],
    });
  } catch (error) {
    console.error("[Quiz] Unhandled error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
