OpenAI Responses Adapter – Canonical Mapping Guide

Overview
- Purpose: bridge between OpenAI “Responses” API and the canonical request/streaming formats used in this gateway.
- Design: table‑driven, minimal superset. Canonical models cross‑provider concepts; vendor‑specific options stay under `provider_params.<vendor>`.

Files
- stream.map.ts: provider ⇄ canonical streaming event registries.
- stream.helpers.ts: small helpers (build canonical chunk, normalization).
- requests.map.ts: request path mappers (client ⇄ canonical).
- requests.helpers.ts: request mapping helpers (messages, generation, etc.).

Minimal‑Superset Principles
- Canonical contains portable, cross‑provider concepts only.
- Provider‑specific options live in `provider_params.openai` (e.g., `prompt_cache_key`, experimental flags).
- Lossless passthrough is preserved via `provider_raw` on streaming chunks for exact SSE reconstruction and forensics.

Request Mapping (Client → Canonical)
- model → model (verbatim).
- input (Responses) → messages (canonical):
  - string → one user message with text.
  - array of items:
    - `{ type: 'message', role, content[] }` → canonical message; `input_text` becomes `text`.
    - `{ type: 'reasoning', ... }` → extracted into top‑level `thinking` (no synthetic message).
- instructions → system (string). If `system` is array in canonical, only text parts are considered when mapping back.
- generation → generation:
  - `max_output_tokens` → `max_tokens`; `temperature`, `top_p`, `stop`, `stop_sequences`, `seed` map 1:1.
- tools, tool_choice, parallel_tool_calls, response_format, include, store → same fields in canonical.
- reasoning → thinking (budget, summary, content, encrypted_content) with `reasoning_effort` kept separate.
- modalities, audio → pass through.
- provider_params.openai.prompt_cache_key (canonical) ⇄ `prompt_cache_key` (Responses).
- service_tier → pass through.
- context (previous_response_id, cache_ref, provider_state) → pass through.

Request Mapping (Canonical → Client/Provider)
- Inverse of the above:
  - messages → input array (text → `input_text`).
  - `thinking` (+ `reasoning_effort`) → `reasoning` object (no synthetic message).
  - system (string or array of text parts) → instructions (string).
  - generation, tools, tool_choice, include, store, modalities, audio, service_tier, context → pass through.
  - `provider_params.openai.prompt_cache_key` → `prompt_cache_key`.

Streaming Mapping (Provider → Canonical)
- Lifecycle: `response.created`, `response.in_progress`, `response.completed`.
  - Terminal mapping policy: `completed` → finish_reason `stop`; `incomplete` → `length`; otherwise keep `response.status` inside event.response.
- Text: `response.output_text.delta` → `content_delta (part: 'text')`, `response.output_text.done` → `output_text_done`, `response.output_text.annotation.added` → `output_text_annotation_added`.
- Structure: `response.output_item.added/done`, `response.content_part.added/done`.
- Tools/Functions: `response.function_call`, `response.tool_call`, `response.function_call.arguments.{delta,done}`.
- Usage: `response.usage`.
- Search: `response.file_search_call.{in_progress,searching,completed}` → `file_search_{start,progress,done}`; same for web search.
- Reasoning Summary: `response.reasoning.summary.{delta,done}` → `reasoning_summary_text_{delta,done}`.
- Refusals: `response.refusal.{delta,done}` → `refusal_{delta,done}`.
- Code Interpreter: `response.code_interpreter_call.code.{delta,done}`, `response.code_interpreter_call.outputs` → `code_interpreter_call_code_{delta,done}` and `function_call_output`.
- Sentinel: `data: [DONE]` → `response_completed` chunk with `provider_raw` carrying the exact line.
- Unknown events: emitted as `unknown_event` with `provider_raw` set (never dropped).

Streaming Mapping (Canonical → Provider)
- Reverse of the above event families. When an exact mapping isn’t available, `provider_raw` (if present) is used to reconstruct the original SSE.

Observability & Diffing
- Live passthrough (true streaming) with tee capture in `openai-responses-passthrough` for diagnostics (no second API call).
- Background canonical diff (fire‑and‑forget) with a soft timeout.
- Diff counters: `total_lines`, `diff_lines`; sampled differences logged.

Capabilities (current)
- text: true
- tools/functions: true
- search (file/web): true
- code_interpreter: true
- refusal: true

Extending the Adapter
- Add a new provider event: implement a row in `providerToCanonical` (stream.map.ts). If not mapped, the fallback will still preserve it via `provider_raw`.
- Add a new canonical event: implement a row in `canonicalToProvider`.
- Add a request field: prefer adding it under `provider_params.openai` first; promote to canonical only if it becomes cross‑provider.

Notes & Caveats
- Multimodal inputs (image/audio/video/document) are currently passed through as-is on the canonical side; add explicit mappings to official Responses shapes only when needed.
- Keep canonical minimal: avoid adding synthetic message types or provider‑only concepts to core; use `provider_params` instead.
