import type { SectorName } from '../types.js';
import { buildUrl, getApiKey, getModel, resolveProvider } from './registry.js';

export async function embed(text: string, _sector: SectorName): Promise<number[]> {
  const cfg = resolveProvider('embed');
  const apiKey = getApiKey(cfg);
  const model = getModel(cfg, 'embed');
  const { url, headers } = buildUrl(cfg, 'embed', model, apiKey);

  const body =
    cfg.name === 'gemini'
      ? { model, content: { parts: [{ text }] } }
      : { model, input: text };

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const b = await resp.text();
    throw new Error(`${cfg.name} embed failed: ${resp.status} ${b}`);
  }

  if (cfg.name === 'gemini') {
    const json = (await resp.json()) as { embedding?: { values?: number[] } };
    return json.embedding?.values ?? [];
  }

  const json = (await resp.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0]?.embedding ?? [];
}

