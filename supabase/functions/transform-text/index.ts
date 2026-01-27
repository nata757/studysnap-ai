import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ocr_text } = await req.json();

    if (!ocr_text || typeof ocr_text !== "string") {
      return new Response(
        JSON.stringify({ error: "ocr_text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `
You are a medical language assistant.

Your tasks:
1. Detect the language of the input text.
2. Transform the SAME medical content into multiple target languages.

CRITICAL RULES:
- Preserve medical meaning exactly.
- Do NOT add new facts.
- Do NOT remove important information.
- Do NOT simplify unless the original text is simple.
- Use correct medical terminology for each language.
- Do NOT mix languages.
- Output MUST be valid JSON only.
- If the source text is unclear, keep the uncertainty in all languages.

Target languages:
- de (German)
- en (English)
- ru (Russian)
- tr (Turkish)
- sr-Latn (Serbian, Latin script)

Serbian MUST be written in Latin script (sr-Latn).

Return ALL languages even if the source text is already written in one of them.
`;

    const userPrompt = `
SOURCE TEXT (from OCR):

${ocr_text}
`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      return new Response(
        JSON.stringify({ error: "Text transformation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Empty AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Invalid JSON from AI:", content);
      return new Response(
        JSON.stringify({ error: "Invalid AI JSON output" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("transform-text error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
