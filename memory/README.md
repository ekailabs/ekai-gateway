# Memory Service (Ekai)

Neuroscience-inspired, sectorized memory kernel. Runs as a standalone service (default port 4005) and is currently opt-in.

## Quickstart (standalone)

```bash
npm install -w memory
npm run build -w memory
npm start -w memory
```

Env (root `.env` or `memory/.env`):

- `GOOGLE_API_KEY` (required for Gemini extract/embeds)
- Optional: `GEMINI_EXTRACT_MODEL` (default `gemini-2.5-flash`)
- Optional: `GEMINI_EMBED_MODEL` (default `text-embedding-004`)
- Optional: `MEMORY_PORT` (default `4005`)
- Optional: `MEMORY_DB_PATH` (default `./memory.db`)
- Optional: `MEMORY_CORS_ORIGIN`

## API (v0)

- `POST /v1/ingest` — ingest an experience  
  Body:
  ```json
  {
  "profile": "optional-slug",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "reasoning": "optional",
  "feedback": {
    "type": "success|failure",
    "value": 0
  },
  "metadata": {}
  }
  ```
  Requires at least one user message. `reasoning`, `feedback`, and `metadata` are optional and currently not used in extraction/scoring (feedback is not yet applied; retrieval_count drives expected_value).
  - `profile` is a slug `[a-z0-9_-]{1,40}`; defaults to `default`.

- `POST /v1/search` — body `{ "query": "...", "profile": "optional-slug" }` → returns `{ workingMemory, perSector, profileId }` with PBWM gating.

- `GET /v1/summary` — per-sector counts + recent items (includes procedural details). Accepts `?profile=slug` (default `default`).

- `DELETE /v1/memory/:id` — delete one; `DELETE /v1/memory` — delete all.

- `GET /health`

## Data model (SQLite)

- `memory` table for episodic / semantic / affective:  
  `id, sector, content, embedding, created_at, last_accessed, event_start, event_end`.
- `procedural_memory` table for structured procedures:  
  `trigger, goal, context, result, steps[], embedding, timestamps`.
- `retrieval_count` tracks how often a memory enters working memory; used in PBWM expected_value.
- `semantic_memory` (graph-lite facts): `subject, predicate, object, valid_from, valid_to, embedding, metadata`.

## Retrieval

- Query is embedded per sector.
- Candidates with cosine `< 0.2` are dropped.
- PBWM-inspired gate (prefrontal–basal ganglia model) scores the rest:

  ```
  x = 0.5 * relevance + 0.25 * expected_value + 0.2 * control - 0.05 * noise
  gate_score = sigmoid(x)
  ```
- We use retrieval_count (log-normalized) for `expected_value` and keep `control = 0.5` for now; small Gaussian noise is applied.
- Candidates are sorted by `gate_score`, top-k per sector are kept, then merged and capped to a working-memory size of 8.

## Architecture (v0)

```mermaid
graph TB
  classDef inputStyle fill:#eceff1,stroke:#546e7a,stroke-width:2px,color:#37474f
  classDef processStyle fill:#e3f2fd,stroke:#1976d2,stroke-width:2px,color:#0d47a1
  classDef sectorStyle fill:#fff3e0,stroke:#f57c00,stroke-width:2px,color:#e65100
  classDef storageStyle fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#880e4f
  classDef engineStyle fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#4a148c
  classDef outputStyle fill:#e8f5e9,stroke:#388e3c,stroke-width:2px,color:#1b5e20

  EXP["Experience Ingest<br>messages + reasoning/feedback"]:::inputStyle
  EXTRACT["Extractor (Gemini)<br>episodic / semantic / procedural / affective"]:::processStyle

  EPISODIC["Episodic"]:::sectorStyle
  SEMANTIC["Semantic"]:::sectorStyle
  PROCEDURAL["Procedural<br>structured: trigger / goal / steps"]:::sectorStyle
  AFFECTIVE["Affective"]:::sectorStyle

  EMBED["Embedder (Gemini)<br>text-embedding-004"]:::processStyle

  STORE["(SQLite)<br>memory table (event_start/end)<br>procedural_memory table"]:::storageStyle
  FACTGRAPH["Semantic Facts<br>subject/predicate/object graph"]:::storageStyle
  STEPGRAPH["Action DAG<br>ordered steps"]:::storageStyle

  QUERY["Search Query"]:::inputStyle
  QEMBED["Query Embeds<br>per sector"]:::processStyle
  CANDIDATES["Candidates<br>(cosine ≥ 0.2)"]:::engineStyle
  PBWM["PBWM Gate<br>sigmoid(0.5*rel + 0.25*exp + 0.2*ctrl - 0.05*noise)"]:::engineStyle
  WM["Working Memory<br>top-k per sector → cap 8"]:::engineStyle

  OUTPUT["Recall Response<br>(workingMemory + perSector)"]:::outputStyle
  UI["Dashboard Memory Vault<br>summary + recent + delete"]:::outputStyle

  EXP --> EXTRACT
  EXTRACT --> EPISODIC
  EXTRACT --> SEMANTIC
  EXTRACT --> PROCEDURAL
  EXTRACT --> AFFECTIVE

  EPISODIC --> EMBED
  SEMANTIC --> FACTGRAPH
  FACTGRAPH --> EMBED
  PROCEDURAL --> STEPGRAPH
  STEPGRAPH --> EMBED
  AFFECTIVE --> EMBED

  EMBED --> STORE

  QUERY --> QEMBED --> CANDIDATES --> PBWM --> WM --> OUTPUT
  STORE --> CANDIDATES

  OUTPUT --> UI
```

## Notes / Limitations

- Only Gemini provider is wired (provider abstraction is pending). OpenAI would need wiring.
