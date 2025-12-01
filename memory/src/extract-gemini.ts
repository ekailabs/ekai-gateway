import type { IngestComponents } from './types.js';

const EXTRACT_MODEL = process.env.GEMINI_EXTRACT_MODEL ?? 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are a cognitive memory extractor. Rewrite the user's message into four distinct memory types.
Always rewrite "I" as "User". Do NOT copy the sentence verbatim; transform it into the correct memory format.

Return ONLY valid JSON with these keys:
{
  "episodic": "",     // past events/experiences with time/place; uncertain or one-off statements go here
  "semantic": "",     // ONLY a stable, context-free, current world-state fact/definition that should update the world model (e.g., "User's current residence is X"); leave empty if doubt or event-like
  "procedural": {     // multi-step actions or instructions
    "trigger": "",    // condition/event that starts the process
    "goal": "",       // objective of the workflow
    "steps": [],      // ordered steps
    "result": "",     // expected outcome
    "context": ""     // optional conditions/prereqs
  },
  "affective": ""     // likes/dislikes/preferences/emotional tone
}

RULES:
- If a field does not apply, return "" (or empty object/array for procedural).
- Do NOT repeat information across fields.
- Episodic = event with time context or uncertain claim.
- Semantic = definitive, current fact or definition; if time-bounded/uncertain, leave empty and use episodic.
- Procedural = must be a workflow; if not, leave empty.
- Affective = ONLY preferences/sentiment.
- NEVER output anything outside the JSON.`;

export async function extractWithGemini(text: string): Promise<IngestComponents> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is required for extraction');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EXTRACT_MODEL}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${text}` }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini extract failed: ${resp.status} ${body}`);
  }

  const json = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(content) as any;

  return {
    episodic: parsed.episodic ?? '',
    semantic: parsed.semantic ?? '',
    procedural: parsed.procedural ?? '',
    affective: parsed.affective ?? '',
  };
}
