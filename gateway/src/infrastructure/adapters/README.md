Canonical Adapters — Guide

Purpose
- Provide deterministic, table‑driven mappings between provider APIs and the canonical request/streaming formats.
- Keep the canonical model a minimal superset of cross‑provider concepts; everything vendor‑specific lives under `provider_params.<vendor>` or within `provider_raw` for streams.

Philosophy
- Minimal Superset: canonical includes only broadly portable concepts (messages, tools/functions, search, code‑interpreter, usage, refusals, reasoning summary, etc.).
- Escape Hatch: non‑portable provider options go in `provider_params.<vendor>`; raw streaming frames are attached as `provider_raw` for exact reconstruction and forensics.
- Table‑Driven: encode/decode logic lives in small registry modules (maps), not scattered across classes.

Folder Pattern (per provider)
- `<provider>/` under this directory (e.g., `openai-responses/`):
  - `stream.map.ts`: provider⇄canonical streaming event registries.
  - `stream.helpers.ts`: common helpers (build canonical chunks, normalization utilities).
  - `requests.map.ts`: client⇄canonical request registries/helpers.
  - `README.md`: provider‑specific mapping notes and coverage.
- The adapter file (e.g., `openai-responses-adapter.ts`) imports these maps and stays thin.

Implementing a New Provider (streaming‑first)
1) Create `<provider>/stream.map.ts` with two registries:
   - `providerToCanonical[eventName] = (data) => CanonicalChunk | CanonicalChunk[] | null`.
   - `canonicalToProvider[eventType] = (event) => ({ event, data }) | null`.
   - Always include an unknown‑event fallback by emitting a canonical chunk with `provider_raw` attached.
2) Add `<provider>/requests.map.ts` with two pure functions:
   - `encodeRequestToCanonical(clientRequest) => CanonicalRequest`.
   - `decodeCanonicalRequest(canonicalRequest) => ProviderRequest`.
3) Keep vendor‑specific options under `provider_params.<vendor>`.
4) In the adapter class, route encode/decode calls to these maps only.

Request Mapping Guidelines
- Messages: convert only real user/assistant messages; avoid synthetic message types.
- System/Instructions: map between canonical `system` (string or text parts) and provider’s instructions field.
- Thinking/Reasoning: store in canonical top‑level `thinking` (+ `reasoning_effort`), not as a message.
- Generation: map common knobs (max_tokens, temperature, top_p, stop/stop_sequences, seed). Leave provider‑only knobs in `provider_params.<vendor>`.
- Tools/Functions: prefer one modern representation. If you must support both, bridge to the provider’s preferred surface.
- Modalities/Audio: only add explicit mappings you need; don’t grow canonical for unused types.

Streaming Mapping Guidelines
- Emit canonical events for portable families (lifecycle, text, structure, tools/functions, usage, search, code‑interpreter, refusals, reasoning summary).
- Attach `provider_raw` (event, data, raw lines) to every emitted chunk for exact SSE reconstruction.
- Map terminal statuses to canonical `finish_reason` only when unambiguous; always preserve the provider’s terminal `response.status` inside the event.

Observability & Runtime
- Passthrough streaming: stream provider bytes directly to clients.
- Tee capture (optional): capture the same bytes for diagnostics; do not make a second provider call.
- Background diff: run canonical encode/decode + diff fire‑and‑forget with a soft timeout and size cap.

Versioning & Schema
- Prefer adding new provider options to `provider_params.<vendor>`; promote into canonical only when they are portable across providers.
- Keep JSON Schemas and TS types aligned over time; when iterating quickly, allow temporary divergence but track it.

Read More
- See `openai-responses/README.md` for a concrete, up‑to‑date example of the mapping tables and policies.
