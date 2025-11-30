import type { IngestComponents } from './types.js';

const EXTRACT_MODEL = process.env.GEMINI_EXTRACT_MODEL ?? 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are a cognitive memory extractor. Your job is to rewrite the user's message into four distinct memory types.
Always rewrite "I" as "User". Do NOT copy the user's sentence directly. Transform it into the correct memory format.

Return ONLY valid JSON with these keys:

{
  "episodic": "",     // past events or experiences (who/what/when/where)
  "semantic": "",     // stable facts, definitions, or general knowledge
  "procedural": {     // multi-step actions or instructions
    "trigger": "",    // the condition or event that starts the process
    "goal": "",       // the objective of the workflow
    "steps": [],      // ordered array of strings describing the actions
    "result": "",     // the expected outcome
    "context": ""     // optional notes or conditions
  },
  "affective": ""     // likes, dislikes, preferences, or emotional tone
}

RULES:
- If a field does not apply, return "" (or empty object/array for procedural).
- Do NOT repeat the same information in multiple fields.
- Episodic = event with time context. If no time is implied, leave it empty.
- Semantic = a fact extracted from the statement, not the event itself.
- Procedural = MUST be a workflow or "how to". If it's just a simple statement, use Semantic.
- Affective = ONLY preferences, sentiment, or emotional stance.
- NEVER output anything outside the JSON.
`;

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
