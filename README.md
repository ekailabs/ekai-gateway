# Ekai Gateway

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/ekailabs/ekai-gateway.svg?style=social)](https://github.com/ekailabs/ekai-gateway)
[![Discord](https://img.shields.io/badge/Discord-Join%20Server-7289da?logo=discord&logoColor=white)](https://discord.com/invite/5VsUUEfbJk)

Multi-provider AI proxy supporting Anthropic, OpenAI, Google Gemini, xAI, and OpenRouter models through OpenAI-compatible and Anthropic-compatible APIs.

**Designed for secure, decentralized AI access** - run inside Oasis ROFL (Runtime OFf-chain Logic) for confidential API key storage and on-chain usage tracking on Sapphire.

## Features

- **Multi-provider**: Anthropic + OpenAI + Google (Gemini) + xAI + OpenRouter models
- **Dual APIs**: OpenAI-compatible + Anthropic-compatible endpoints
- **Cost-optimized routing**: Automatic selection of cheapest provider for each model
- **On-chain usage logging**: Immutable usage receipts on Sapphire blockchain
- **Confidential key storage**: API keys encrypted with ROFL X25519 keys
- **Persistent storage**: SQLite database with persistent volume for usage tracking
- **User preferences**: Per-user model preferences and API key delegation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Oasis ROFL (TEE)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Ekai Gateway                        │   │
│  │  • Decrypts API keys using ROFL-derived X25519 key  │   │
│  │  • Routes requests to AI providers                   │   │
│  │  • Logs usage receipts on-chain                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Sapphire Blockchain                         │
│  • EkaiControlPlane contract                                 │
│  • Encrypted API key storage (per user, per provider)        │
│  • On-chain usage receipts (immutable audit trail)           │
│  • Model access control                                      │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start (Beta)

**Option 1: Using npm (local development)**
```bash
# 1. Install dependencies
npm install

# 2. Setup environment variables
cp .env.example .env
# Edit .env and add at least one API key (see .env.example for details)

# 3. Build and start the application
npm run build
npm start
```

**Option 2: Using Docker (published image)**
```bash
# 1. Setup environment variables
cp .env.example .env
# Edit .env and add at least one API key (see .env.example for details)

# 2. Pull + start the latest GHCR image
docker compose up -d

# Optional: run without Compose
docker pull ghcr.io/ekailabs/ekai-gateway:latest
docker run --env-file .env -p 3001:3001 ghcr.io/ekailabs/ekai-gateway:latest
```

**Access Points:**
- Gateway API: `http://localhost:3001`
- Detailed setup steps live in `docs/getting-started.md`; check `docs/` for additional guides.

### Build the Image Yourself (optional)

If you're contributing changes or need a custom build:

```bash
docker build -t ekai-gateway .
docker run --env-file .env -p 3001:3001 ekai-gateway
```

### Push to GHCR (maintainers)

```bash
# Login to ghcr.io (requires GitHub PAT with packages:write)
echo "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin

# Build and push
docker build -t ghcr.io/ekailabs/ekai-gateway:oasis .
docker push ghcr.io/ekailabs/ekai-gateway:oasis
```

### Update ROFL Deployment

After updating code, rebuild and redeploy the ROFL app:

```bash
# Build & deploy ROFL app
oasis rofl build
oasis rofl update
oasis rofl deploy

# Or restart existing machine
oasis rofl machine restart
```

## ROFL Key Setup (Sapphire Integration)

The gateway uses X25519-DeoxysII encryption for secure API key storage on Sapphire. When running inside ROFL, the gateway automatically derives a deterministic encryption keypair from its app identity.

### How It Works

1. **Inside ROFL**: The gateway derives an X25519 keypair using `@oasisprotocol/rofl-client`
2. **Outside ROFL**: Falls back to `ROFL_PRIVATE_KEY` environment variable (for local dev)

### Provider ID Encoding

Provider IDs are encoded as `keccak256(providerName.toUpperCase())` to match the client SDK format. This ensures consistency between:
- Client SDK: `keccak256(ethers.toUtf8Bytes(name.toUpperCase()))`
- Gateway: `keccak256(stringToHex(providerName.toUpperCase()))`

### Getting the Public Key

After deployment, retrieve the public key to register with the EkaiControlPlane contract:

**Option 1: Via API endpoint**:
```bash
curl https://p3001.<your-rofl-domain>.rofl.app/rofl/public-key
```

Response:
```json
{
  "publicKey": "0x...",
  "publicKeyBytes": "...",
  "isInsideRofl": true,
  "isAvailable": true,
  "usage": "Call setRoflKey(bytes) on EkaiControlPlane contract with publicKeyBytes"
}
```

**Option 2: From logs** - The public key is printed on startup:
```
========================================
ROFL PUBLIC KEY (for contract registration):
0x<your-public-key-hex>
========================================
```

**Option 3: From machine logs**:
```bash
oasis rofl machine logs
```

## On-Chain Usage Logging

The gateway logs usage receipts to the Sapphire blockchain for every API call, providing:

- **Immutable audit trail**: Usage cannot be tampered with
- **Transparent billing**: Users can verify their usage independently
- **Decentralized trust**: No need to trust the gateway operator

Each receipt includes:
- Request hash (unique identifier)
- Owner address (API key owner)
- Delegate address (request maker)
- Provider ID and Model ID
- Prompt and completion token counts

### Data Persistence

Usage data is stored in two places:

1. **On-chain (Sapphire)**: Immutable receipts via `logReceipt()` - permanent, verifiable
2. **Local SQLite**: Fast queries for dashboard - persists across container restarts via mounted volume at `/app/gateway/data`

## Integration Guides

### **Claude Code Integration**
Use the gateway with Claude Code for multi-provider AI assistance:

```bash
# Point Claude Code to the gateway
export ANTHROPIC_BASE_URL="http://localhost:3001"
export ANTHROPIC_MODEL="grok-code-fast-1"  # or "gpt-4o","claude-sonnet-4-20250514"

# Start Claude Code as usual
claude
```

**[Complete Claude Code Guide →](./docs/USAGE_WITH_CLAUDE_CODE.md)**

### **Codex Integration**
Use the gateway with Codex for OpenAI-compatible development tools:

```bash
# Point Codex to the gateway
export OPENAI_BASE_URL="http://localhost:3001/v1"

# Start Codex as usual
codex
```

**[Complete Codex Guide →](./docs/USAGE_WITH_CODEX.md)**

## Beta Testing Notes

**This is a beta release** - please report any issues or feedback!

**Known Limitations:**
- Some edge cases in model routing may exist
- GPT-5.x models require `max_completion_tokens` instead of `max_tokens`

**Getting Help:**
- Check the logs in `gateway/logs/gateway.log` for debugging
- Ensure your API keys have sufficient credits
- Test with simple requests first before complex workflows

## Project Structure

```
ekai-gateway/
├── gateway/          # Backend API and routing
│   └── src/
│       ├── app/              # Request handlers
│       ├── domain/           # Business logic
│       ├── infrastructure/   # Database, crypto, passthrough
│       └── shared/           # Types and errors
├── model_catalog/    # Provider and model configurations
├── rofl.yaml         # ROFL deployment configuration
├── docker-compose.yaml
└── package.json      # Root package configuration
```

## API Endpoints

```bash
# Chat endpoints (auth required)
POST /v1/chat/completions  # OpenAI-compatible chat endpoint
POST /v1/messages          # Anthropic-compatible messages endpoint
POST /v1/responses         # OpenAI Responses endpoint

# User preferences (auth required)
GET  /user/preferences     # Get user preferences
PUT  /user/preferences     # Update user preferences

# Public endpoints
GET  /v1/models           # List available models
GET  /usage               # View token usage and costs
GET  /health              # Health check endpoint
GET  /rofl/public-key     # Get ROFL X25519 public key
```

```bash
# OpenAI-compatible endpoint (works with all providers)
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'

# Use Claude models via OpenAI-compatible endpoint
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-haiku-4-5", "messages": [{"role": "user", "content": "Hello"}]}'

# Use xAI Grok models
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"model": "grok-code-fast-1", "messages": [{"role": "user", "content": "Hello"}]}'

# Anthropic-compatible endpoint
curl -X POST http://localhost:3001/v1/messages \
  -H "x-api-key: <token>" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-haiku-4-5", "max_tokens": 100, "messages": [{"role": "user", "content": "Hello"}]}'

# OpenAI Responses endpoint
curl -X POST http://localhost:3001/v1/responses \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o-mini", "input": "Say hi in one short sentence.", "temperature": 0.7, "max_output_tokens": 128}'

# Check usage and costs
curl http://localhost:3001/usage

# Get ROFL public key
curl http://localhost:3001/rofl/public-key
```

## User Preferences

Users must configure `model_preferences` before making API calls.

```bash
# Get preferences
curl http://localhost:3001/user/preferences \
  -H "Authorization: Bearer <token>"

# Set model preferences
curl -X PUT http://localhost:3001/user/preferences \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"model_preferences": ["grok-code-fast-1", "claude-haiku-4-5", "gpt-4o"]}'

# Delegate billing to another wallet
curl -X PUT http://localhost:3001/user/preferences \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"api_address": "0x1234..."}'
```

| Field | Description |
|-------|-------------|
| `model_preferences` | List of models user can access (required for API calls) |
| `api_address` | Wallet to bill - own address or delegate to another |

**Behavior:**
- `GET /v1/models` with auth returns only user's preferred models
- Requests for models not in preferences fallback to first model in list
- Models are validated against catalog and provider availability

## Model Routing (Cost-Optimized)

The proxy uses **cost-based optimization** to automatically select the cheapest available provider:

1. **Special routing**: Grok models (`grok-code-fast-1`, `grok-3`, `grok-4`) → xAI (if available)
2. **Cost optimization**: All other models are routed to the cheapest provider that supports them
3. **Provider fallback**: Graceful fallback if preferred provider is unavailable

**Supported providers**:
- **Anthropic**: Claude models (direct API access)
- **OpenAI**: GPT models, O-series reasoning models (direct API access)
- **xAI**: Grok models (direct API access)
- **Google**: Gemini models (direct API access)
- **OpenRouter**: Multi-provider access with `provider/model` format

**Multi-client proxy**: Web apps, mobile apps, and scripts share conversations across providers with automatic cost tracking and optimization.

## Production Commands

```bash
npm run build  # Build TypeScript for production
npm start      # Start gateway
```

## Development

```bash
npm run dev    # Start gateway in development mode
```

## Contributing

Contributions are highly valued and welcomed! See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License
Licensed under the [Apache License 2.0](./LICENSE).
