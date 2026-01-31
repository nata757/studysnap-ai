// supabase/functions/transform-text/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ocr_text = body?.ocr_text;

    if (!ocr_text || typeof ocr_text !== "string") {
      return new Response(
        JSON.stringify({ error: "ocr_text is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const systemPrompt = `
You are a medical language assistant.

Your tasks:
1) Detect the language of the input text.
2) Transform the SAME medical content into multiple target languages.

CRITICAL RULES:
- Preserve medical meaning exactly.
- Do NOT add new facts.
- Do NOT remove important information.
- Do NOT invent or assume anything.
- Use correct medical terminology for each language.
- Do NOT mix languages.
- If the source text is unclear, keep the uncertainty in all languages.

Target languages:
- de (German)
- en (English)
- ru (Russian)
- tr (Turkish)
- sr-Latn (Serbian, Latin script)

Serbian MUST be written in Latin script (sr-Latn).
Return ALL languages even if the source is already in one of them.
`.trim();

    const userPrompt = `
SOURCE TEXT (from OCR):
`.trim();

    const response = await fetch(
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
                name: "transform_text",
                description:
                  "Detect language and transform medical text into multiple target languages.",
                parameters: {
                  type: "object",
                  properties: {
                    detected_language: {
                      type: "string",
                      description:
                        "Detected ISO language code of the source text (de/en/ru/tr/sr).",
                    },
                    texts: {
                      type: "object",
                      properties: {
                        de: { type: "string" },
                        en: { type: "string" },
                        ru: { type: "string" },
                        tr: { type: "string" },
                        "sr-Latn": { type: "string" },
                      },
                      required: ["de", "en", "ru", "tr", "sr-Latn"],
                      additionalProperties: false,
                    },
                    warnings: {
                      type: "array",
                      items: { type: "string" },
                      description: "Any issues or unclear content warnings.",
                    },
                  },
                  required: ["detected_language", "texts", "warnings"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "transform_text" } },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      // аккуратные статусы, если вдруг пригодится
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ error: "Text transformation failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();

    // Extract tool call arguments (guaranteed JSON)
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;

    if (!args) {
      console.error("No tool call arguments in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Invalid AI response format" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(args);
    } catch (e) {
      console.error("Failed to parse tool arguments:", args);
      return new Response(
        JSON.stringify({ error: "Invalid AI tool arguments" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Мини-валидация, чтобы фронту было легче
    if (
      !parsed?.texts ||
      typeof parsed.texts?.de !== "string" ||
      typeof parsed.texts?.en !== "string" ||
      typeof parsed.texts?.ru !== "string" ||
      typeof parsed.texts?.tr !== "string" ||
      typeof parsed.texts?.["sr-Latn"] !== "string"
    ) {
      console.error("Parsed output missing required fields:", parsed);
      return new Response(
        JSON.stringify({ error: "AI output missing required fields" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("transform-text error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
