# Get Started with x402

This guide explains how to enable and use x402 pay-for-inference with the Ekai Gateway.

## Overview

x402 enables on‑chain, per‑request payments when a target model does not have a API key configured. The gateway automatically handles 402 responses, performs the on‑chain payment in stablecoins, retries the request with proof, and streams the provider’s response back to your client.

## Prerequisites

- Ekai Gateway with x402 support enabled.
- An EVM wallet private key funded with USDC on a supported chain.

## Configuration

Set environment variables before starting the gateway:

```
# Required for x402 payments
PRIVATE_KEY=0x...  # EVM private key with USDC balance

# Optional: override x402 endpoint(s)
X402_BASE_URL=x402_supported_provider_url
```

Gateway modes and endpoints are configured via `config.x402` (see logs at startup):
- `config.x402.enabled`: enable or disable x402.
- `config.x402.baseUrl`, `config.x402.chatCompletionsUrl`, `config.x402.messagesUrl`.
- Startup logs indicate `x402-only`, `hybrid`, or `BYOK` mode based on your key/config setup.

## How It Works

1. **Initial request**: the gateway sends a normal request to an x402‑enabled endpoint.
2. **402 response**: if payment is required, the server returns HTTP 402 Payment Required with payment parameters.
3. **Automatic payment**: the `x402-fetch` wrapper intercepts the 402, creates the on‑chain payment, and prepares proof.
4. **Request retry**: the original request is retried automatically with the payment proof header.
5. **Service access**: the service validates proof and returns the inference response, which the gateway streams to your client.

## Client Usage

Use your existing OpenAI- or Anthropic‑compatible clients (Claude Code, Codex, Cursor) pointed at the gateway. When a chosen model has no API key, the gateway routes via x402 automatically; otherwise it uses your configured provider keys directly.

## Supported Providers & Endpoints

| Provider | /chat/completions | /messages | Pattern |
|----------|-------------------|-----------|---------|
| **OpenRouter** | ✅ (100+ models) |  | Any OpenRouter model ID (e.g., `openai/gpt-5`, `moonshotai/kimi-k2-thinking`) |
| **Anthropic** |  | ✅ | Models containing `claude` (e.g., `claude-haiku-4-5-20251001`) |
| **xAI** |  | ✅ | Models containing `grok` (e.g., `grok-code-fast-1`) |

Notes:
- Model IDs must follow the provider’s naming (e.g., `<provider>/<model>` for OpenRouter, `claude-*` for Anthropic).
