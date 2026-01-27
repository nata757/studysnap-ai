import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { material_id, ocr_text, title, topic, count = 8, language = 'ru' } = await req.json();

    if (!material_id || !ocr_text) {
      return new Response(
        JSON.stringify({ error: 'material_id and ocr_text are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating quiz for material:', material_id, 'count:', count, 'language:', language);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an AI assistant for medical students preparing for exams.
    Your task is to create multiple-choice quiz questions for exam practice.

    IMPORTANT:
    Generate questions and explanations strictly in language: ${language}.

    CRITICAL RULES:
    1. ONLY use information explicitly stated in the provided text
    ...
    Create exactly ${count} questions.`;



    const userPrompt = `Create ${count} multiple-choice quiz questions from this lecture material:

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
                          description: "Exactly 4 answer options" 
                        },
                        correctIndex: { 
                          type: "number", 
                          description: "Index of correct answer (0-3)" 
                        },
                        explanation: { 
                          type: "string", 
                          description: "Why the correct answer is right" 
                        },
                        confidence: { 
                          type: "string", 
                          enum: ["high", "medium", "low"],
                          description: "Confidence based on source clarity" 
                        }
                      },
                      required: ["question", "options", "correctIndex", "explanation", "confidence"],
                      additionalProperties: false
                    }
                  },
                  warnings: {
                    type: "array",
                    items: { type: "string" },
                    description: "Any issues or unclear content"
                  }
                },
                required: ["questions", "warnings"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_quiz" } }
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
        JSON.stringify({ error: 'Quiz generation failed' }),
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

    let quizData: any;
    try {
      quizData = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error('Failed to parse tool arguments:', toolCall.function.arguments);
      return new Response(
        JSON.stringify({ error: 'Invalid AI tool arguments' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsed quiz questions:', quizData.questions?.length);


    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase env not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);


    // Delete existing quiz questions for this material AND language
    await supabase
      .from('quiz_questions')
      .delete()
      .eq('material_id', material_id)
      .eq('language', language);

    // Insert new quiz questions with language
    const questionsToInsert = quizData.questions.map((q: any) => ({
      material_id,
      question: q.question,
      options: q.options,
      correct_index: q.correctIndex,
      explanation: q.explanation,
      confidence: q.confidence,
      language,
    }));

    const { data: insertedQuestions, error: insertError } = await supabase
      .from('quiz_questions')
      .insert(questionsToInsert)
      .select();

    if (insertError) {
      console.error('Database error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save quiz questions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Quiz questions saved successfully:', insertedQuestions?.length);

    return new Response(
      JSON.stringify({
        questions: insertedQuestions,
        warnings: quizData.warnings || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Generate quiz error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
