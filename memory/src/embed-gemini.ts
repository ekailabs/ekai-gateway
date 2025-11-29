import type { SectorName } from './types.js';

const DEFAULT_MODEL = process.env.GEMINI_EMBED_MODEL ?? 'text-embedding-004';

export async function embedWithGemini(text: string, _sector: SectorName): Promise<number[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is required for embeddings');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:embedContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      content: { parts: [{ text }] },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini embed failed: ${resp.status} ${body}`);
  }

  const json = (await resp.json()) as { embedding?: { values?: number[] } };
  return json.embedding?.values ?? [];
}
