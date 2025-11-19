# Supported Providers and Models

The Ekai Gateway supports multiple providers and automatically routes requests to the correct one based on model name and request type.  
Models are grouped by the API format they support: **Chat Completions** (OpenAI-compatible) and **Messages** (Anthropic-compatible).

---

## Chat Completions Providers

These models are compatible with the `/v1/chat/completions` endpoint and use the **OpenAI-style API format**.

| Provider | Models | Base URL | Auth Env Var |
|-----------|---------|-----------|---------------|
| **OpenAI** | `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-chat-latest`, `gpt-5-codex`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `gpt-4o-2024-05-13`, `gpt-4o-mini`, `gpt-4o-mini-4k`, `gpt-4o-mini-8k`, `gpt-realtime`, `gpt-4o-realtime-preview`, `gpt-4o-mini-realtime-preview`, `gpt-audio`, `gpt-4o-audio-preview`, `gpt-4o-mini-audio-preview`, `o1`, `o1-pro`, `o3-pro`, `o3`, `o3-deep-research`, `o4-mini`, `o4-mini-deep-research`, `o3-mini`, `o1-mini`, `codex-mini-latest`, `gpt-4o-mini-search-preview`, `gpt-4o-search-preview`, `computer-use-preview`, `gpt-image-1`, `gpt-3.5-turbo`, `chatgpt-4o-latest`, `gpt-4-turbo-2024-04-09`, `gpt-4-0125-preview`, `gpt-4-1106-preview`, `gpt-4-1106-vision-preview`, `gpt-4-0613`, `gpt-4-0314`, `gpt-4-32k`, `gpt-3.5-turbo-0125`, `gpt-3.5-turbo-1106`, `gpt-3.5-turbo-0613`, `gpt-3.5-0301`, `gpt-3.5-turbo-instruct`, `gpt-3.5-turbo-16k-0613`, `davinci-002`, `babbage-002` | `https://api.openai.com/v1/chat/completions` | `OPENAI_API_KEY` |
| **Google (Gemini)** | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.0-pro-preview` | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `GOOGLE_API_KEY` |
| **xAI** | `grok-4`, `grok-3`, `grok-3-mini`, `grok-code-fast-1`, `grok-code-fast`, `grok-code-fast-1-0825` | `https://api.x.ai/v1/chat/completions` | `XAI_API_KEY` |
| **OpenRouter** | Any `provider/model` slug supported by OpenRouter (e.g., `openai/gpt-5`). See the [OpenRouter catalog](https://openrouter.ai/models) for the full list of current slugs. | `https://openrouter.ai/api/v1/chat/completions` | `OPENROUTER_API_KEY` |

All chat completion providers follow the OpenAI schema and support tools or clients that expect an OpenAI-compatible interface.

---

## Messages Providers

These models are compatible with the `/v1/messages` endpoint and use the **Anthropic-style API format**.

| Provider | Models | Base URL | Auth Env Var |
|-----------|---------|-----------|---------------|
| **Anthropic** | `claude-3-5-sonnet`, `claude-3-5-sonnet-latest`, `claude-3-5-haiku`, `claude-3-5-haiku-latest`, `claude-3-haiku`, `claude-3-opus`, `claude-3-sonnet`, `claude-opus-4.1`, `claude-sonnet-4` | `https://api.anthropic.com/v1/messages` | `ANTHROPIC_API_KEY` |
| **xAI** | `grok-code-fast-1`, `grok-1`, `grok-2`, `grok-4-0709`, `grok-vision-beta` | `https://api.x.ai/v1/messages` | `XAI_API_KEY` |
| **ZAI** | `glm-4.6`, `glm-4.5`, `glm-4.5-air`, `glm-4.5-x`, `glm-4.5-airx`, `glm-4.5-flash`, `glm-4-32b-0414-128k` | `https://api.z.ai/api/anthropic/v1/messages` | `ZAI_API_KEY` |

All message providers support the Anthropic message format and can be used interchangeably with clients like Claude Code or Claude Desktop.

---

## Format Overview

| Format | Endpoint | Typical Clients | Compatible Providers |
|---------|-----------|-----------------|----------------------|
| **OpenAI-style (Chat Completions)** | `/v1/chat/completions` | Codex, OpenRouter, local SDKs | OpenAI, xAI, OpenRouter |
| **Anthropic-style (Messages)** | `/v1/messages` | Claude Code, Claude Desktop | Anthropic, xAI, ZAI |

---

## Routing Behavior

- Requests are dispatched based on the **model name**.  
- The Gateway looks up the model in its catalog and automatically maps it to the correct provider and endpoint type.  
- If multiple providers host the same model, the Gateway selects the **cheapest available provider**.  
- Failed requests automatically **fall back** to secondary providers where possible.  
- All routing decisions are logged in the Dashboard under “Provider Usage”.

---

## Example Model Usage

**Chat Completions (OpenAI format):**
```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "messages": [{"role": "user", "content": "Summarize this text"}]
  }'
```

**Messages (Anthropic format):**
```bash
curl http://localhost:3001/v1/messages \
  -H "x-api-key: test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-3-5-sonnet",
    "messages": [{"role": "user", "content": "Explain reinforcement learning"}]
  }'
```

---

## Summary

- **Chat Completions:** OpenAI-style interface (`/v1/chat/completions`) for OpenAI, xAI, and OpenRouter.  
- **Messages:** Anthropic-style interface (`/v1/messages`) for Anthropic, xAI, and ZAI.  
- **Unified Gateway:** One endpoint, one configuration, and full visibility of all providers in the Dashboard.

Ekai’s model catalog is continuously updated to include the newest models as they become available.
