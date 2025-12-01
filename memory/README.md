# Memory Service (Ekai)

Neuroscience-inspired, sectorized memory kernel. Runs as a standalone service (default port 4005) and is currently opt-in.

## Quickstart
```bash
npm install -w memory
npm run build -w memory
npm start -w memory
```
Env (root `.env` or `memory/.env`):
- `GOOGLE_API_KEY` (required for Gemini extract/embeds)
- Optional: `GEMINI_EXTRACT_MODEL` (default `gemini-2.5-flash`), `GEMINI_EMBED_MODEL` (default `text-embedding-004`), `MEMORY_PORT` (default 4005), `MEMORY_DB_PATH` (default `./memory.db`), `MEMORY_CORS_ORIGIN`.

## API (v0)
- `POST /v1/ingest` — ingest an experience
  - Body:
    ```json
    {
      "messages": [
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."}
      ],
      "reasoning": "optional",
      "feedback": {"type": "success|failure|like|dislike|correction|none", "value": 0},
      "metadata": {...}
    }
    ```
    Requires at least one user message. Current extractor uses only the latest user content.
- `POST /v1/search` — body `{ "query": "..." }` → returns `{ workingMemory, perSector }` with PBWM gating.
- `GET /v1/summary` — per-sector counts + recent items (includes procedural details).
- `DELETE /v1/memory/:id` — delete one; `DELETE /v1/memory` — delete all.
- `GET /health`

## Data model (SQLite)
- `memory` table for episodic/semantic/affective: `id, sector, content, embedding, created_at, last_accessed, event_start, event_end`.
- `procedural_memory` table for structured procedures: `trigger, goal, context, result, steps[], embedding, timestamps`.

## Retrieval
- Query is embedded per sector.
- Candidates with cosine < 0.2 are dropped. A PBWM-inspired gate (prefrontal–basal ganglia model) scores the rest:
  - `x = 0.5 * relevance + 0.25 * expected_value + 0.2 * control - 0.05 * noise`
  - `gate_score = sigmoid(x)`
  - We currently fix `expected_value = control = 0.5` and use small Gaussian noise; candidates are sorted by `gate_score`, top-k per sector are kept, then merged and capped to a working-memory size of 8.

## Notes / Limitations
- Only Gemini provider is wired (provider abstraction is pending); OpenAI would need wiring.
- `reasoning/feedback` are accepted in ingest but not yet used to populate sectors.
- No ANN/VSS; scans are capped for v0.
- No auth; intended for local/dev use.
