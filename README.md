# Ekai Gateway

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Multi-provider AI proxy with usage dashboard supporting OpenAI, OpenRouter, and Anthropic models through OpenAI-compatible and Anthropic-compatible APIs.

**Designed for self-hosted personal use** - run your own instance to securely proxy AI requests using your API keys.

## Project Structure

```
ekai-gateway/
├── gateway/          # Backend API and routing
├── ui/              # Dashboard frontend
├── shared/          # Shared types and utilities
└── package.json     # Root package configuration
```

## Features

- 🤖 **Multi-provider**: OpenAI + OpenRouter + Anthropic models
- 🔄 **Dual APIs**: OpenAI-compatible + Anthropic-compatible endpoints
- 🔀 **Smart routing**: Automatic provider selection based on model name
- 💰 **Usage tracking**: Track token usage and costs with visual dashboard
- 🗄️ **Database storage**: SQLite database for persistent usage tracking

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment (create .env in repository root)
OPENROUTER_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
PORT=3001

# Start development servers
npm run dev
```

Access the gateway at `http://localhost:3001` and dashboard at `http://localhost:3000`.

## API Endpoints

```bash
POST /v1/chat/completions  # OpenAI-compatible chat endpoint
POST /v1/messages          # Anthropic-compatible messages endpoint
GET  /v1/models           # List available models
GET  /usage               # View token usage and costs
GET  /health              # Health check endpoint
```

```bash
# OpenAI-compatible endpoint (works with all providers)
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'

# Use Claude models via OpenAI-compatible endpoint
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-5-sonnet-20241022", "messages": [{"role": "user", "content": "Hello"}]}'

# Anthropic-compatible endpoint
curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-5-sonnet-20241022", "max_tokens": 100, "messages": [{"role": "user", "content": "Hello"}]}'

# Both endpoints support all models and share conversation context
# Client A uses OpenAI format, Client B uses Anthropic format - same conversation!

# Check usage and costs
curl http://localhost:3001/usage
```

## Model Routing

The proxy automatically routes requests to the appropriate provider:

- **Claude models** (e.g., `claude-3-5-sonnet-20241022`) → Anthropic
- **OpenAI models** (e.g., `gpt-4o`, `gpt-3.5-turbo`) → OpenAI  
- **Other models** (e.g., `anthropic/claude-3.5-sonnet`, `meta-llama/llama-3.1-8b-instruct`) → OpenRouter

**Multi-client proxy**: Web apps, mobile apps, and scripts share one conversation across all providers with automatic cost tracking.

## Development

```bash
npm run dev    # Start both gateway and dashboard
npm run build  # Build TypeScript
npm start      # Production server
```

**Individual services:**
```bash
cd gateway && npm run dev    # Gateway only (port 3001)
cd ui/dashboard && npm run dev    # Dashboard only (port 3000)
```

## License
Licensed under the [Apache License 2.0](./LICENSE).
