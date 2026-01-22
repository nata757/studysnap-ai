import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      console.error('No image provided');
      return new Response(
        JSON.stringify({ error: 'No image provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing OCR request, image size:', imageBase64.length);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Gemini Vision for OCR via Lovable AI Gateway
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
            content: `You are an OCR assistant for medical study materials. Extract ALL text from the image accurately.
            
RULES:
1. Extract text exactly as written, preserving structure
2. Keep bullet points, numbering, and formatting
3. If handwritten text is unclear, mark with [unclear]
4. Preserve medical terminology accurately
5. Return ONLY the extracted text, no explanations

After the text, add a new line and rate your confidence:
CONFIDENCE: high | medium | low`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text from this image of study material:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'OCR processing failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI Gateway response received');

    const fullText = data.choices?.[0]?.message?.content || '';
    
    // Parse confidence from response
    let text = fullText;
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    
    const confidenceMatch = fullText.match(/CONFIDENCE:\s*(high|medium|low)/i);
    if (confidenceMatch) {
      confidence = confidenceMatch[1].toLowerCase() as 'high' | 'medium' | 'low';
      text = fullText.replace(/\n?CONFIDENCE:\s*(high|medium|low)/i, '').trim();
    }

    console.log('OCR completed, confidence:', confidence, 'text length:', text.length);

    return new Response(
      JSON.stringify({ text, confidence }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OCR error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
