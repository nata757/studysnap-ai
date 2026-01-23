import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { material_id, ocr_text, title, topic, language = 'ru' } = await req.json();

    if (!material_id || !ocr_text) {
      return new Response(
        JSON.stringify({ error: 'material_id and ocr_text are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating summary for material:', material_id, 'language:', language);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an AI assistant for medical students preparing for exams.
Your task is to summarize lecture notes accurately for exam preparation.

CRITICAL RULES:
1. ONLY use information explicitly stated in the provided text
2. NEVER invent, assume, or add facts not present in the source
3. If information is unclear, incomplete, or ambiguous:
   - Mark that section with [needs clarification]
   - Add it to the warnings array
4. Preserve medical terminology exactly as written
5. Structure content for easy exam review

OUTPUT FORMAT (JSON only, no markdown):
{
  "short": "5-8 bullet points covering key exam facts",
  "medium": "Structured outline with main topics and subtopics",
  "long": "Detailed summary preserving important details, still concise",
  "warnings": ["list of unclear or missing information that needs clarification"],
  "confidence": "high | medium | low"
}

If the text is too short or unclear to summarize meaningfully, set confidence to "low" and explain in warnings.`;

    const userPrompt = `Summarize this lecture material for exam preparation:

${title ? `Title: ${title}` : ''}
${topic ? `Topic: ${topic}` : ''}

LECTURE TEXT:
${ocr_text}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_summary",
              description: "Generate structured summaries for exam preparation",
              parameters: {
                type: "object",
                properties: {
                  short: {
                    type: "string",
                    description: "5-8 bullet points covering key exam facts"
                  },
                  medium: {
                    type: "string",
                    description: "Structured outline with main topics and subtopics"
                  },
                  long: {
                    type: "string",
                    description: "Detailed summary preserving important details"
                  },
                  warnings: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of unclear or missing information"
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "Overall confidence in the summary accuracy"
                  }
                },
                required: ["short", "medium", "long", "warnings", "confidence"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_summary" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Summary generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error('No tool call in response:', JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: 'Invalid AI response format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const summaryData = JSON.parse(toolCall.function.arguments);
    console.log('Parsed summary, confidence:', summaryData.confidence);

    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if summary already exists for this material AND language
    const { data: existing } = await supabase
      .from('summaries')
      .select('id')
      .eq('material_id', material_id)
      .eq('language', language)
      .maybeSingle();

    let dbResult;
    if (existing) {
      // Update existing summary
      dbResult = await supabase
        .from('summaries')
        .update({
          short_summary: summaryData.short,
          medium_summary: summaryData.medium,
          long_summary: summaryData.long,
          warnings: summaryData.warnings || [],
          generated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new summary with language
      dbResult = await supabase
        .from('summaries')
        .insert({
          material_id,
          short_summary: summaryData.short,
          medium_summary: summaryData.medium,
          long_summary: summaryData.long,
          warnings: summaryData.warnings || [],
          language,
        })
        .select()
        .single();
    }

    if (dbResult.error) {
      console.error('Database error:', dbResult.error);
      return new Response(
        JSON.stringify({ error: 'Failed to save summary' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Summary saved successfully');

    return new Response(
      JSON.stringify({
        summary: dbResult.data,
        confidence: summaryData.confidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Generate summary error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
