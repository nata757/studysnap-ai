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
    const { material_id, ocr_text, title, topic, count = 15 } = await req.json();

    if (!material_id || !ocr_text) {
      return new Response(
        JSON.stringify({ error: 'material_id and ocr_text are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating flashcards for material:', material_id, 'count:', count);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an AI assistant for medical students preparing for exams.
Your task is to create flashcards for spaced repetition learning.

CRITICAL RULES:
1. ONLY use information explicitly stated in the provided text
2. NEVER invent, assume, or add facts not present in the source
3. If information is unclear or incomplete:
   - Set confidence to "low"
   - Keep the card but note uncertainty in the answer
4. Create clear, concise question-answer pairs suitable for quick review
5. Focus on key facts, definitions, and concepts important for exams
6. Preserve medical terminology exactly as written

Create exactly ${count} flashcards.`;

    const userPrompt = `Create ${count} flashcards from this lecture material:

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
              name: "generate_flashcards",
              description: "Generate flashcards for spaced repetition learning",
              parameters: {
                type: "object",
                properties: {
                  flashcards: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        q: { type: "string", description: "The question" },
                        a: { type: "string", description: "The answer" },
                        confidence: { 
                          type: "string", 
                          enum: ["high", "medium", "low"],
                          description: "Confidence level based on source clarity" 
                        }
                      },
                      required: ["q", "a", "confidence"],
                      additionalProperties: false
                    }
                  },
                  warnings: {
                    type: "array",
                    items: { type: "string" },
                    description: "Any issues or unclear content"
                  }
                },
                required: ["flashcards", "warnings"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_flashcards" } }
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
        JSON.stringify({ error: 'Flashcard generation failed' }),
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

    const flashcardsData = JSON.parse(toolCall.function.arguments);
    console.log('Parsed flashcards:', flashcardsData.flashcards?.length);

    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Delete existing flashcards for this material
    await supabase
      .from('flashcards')
      .delete()
      .eq('material_id', material_id);

    // Insert new flashcards
    const today = new Date().toISOString().split('T')[0];
    const flashcardsToInsert = flashcardsData.flashcards.map((fc: any) => ({
      material_id,
      question: fc.q,
      answer: fc.a,
      confidence: fc.confidence,
      stage: 0,
      due_date: today,
    }));

    const { data: insertedCards, error: insertError } = await supabase
      .from('flashcards')
      .insert(flashcardsToInsert)
      .select();

    if (insertError) {
      console.error('Database error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save flashcards' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Flashcards saved successfully:', insertedCards?.length);

    return new Response(
      JSON.stringify({
        flashcards: insertedCards,
        warnings: flashcardsData.warnings || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Generate flashcards error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
