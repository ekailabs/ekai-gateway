# AI Proxy Backend

Multi-provider AI proxy with shared conversations across clients. Supports OpenAI and OpenRouter models through OpenAI-compatible and Anthropic-compatible APIs.

## Features

- 🤖 **Multi-provider**: OpenAI + OpenRouter models
- 🔄 **Dual APIs**: OpenAI-compatible + Anthropic-compatible endpoints
- 💬 **Shared conversations**: Context across all clients  
- 🧠 **Auto context**: Single messages include conversation history
- 💰 **Real-time billing**: Track token usage and costs automatically

## Quick Start

```bash
# Install
npm install

# Setup .env
OPENROUTER_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
PORT=3001

# Run
npm run dev
```

## API Endpoints

```bash
POST /v1/chat/completions  # OpenAI-compatible chat endpoint
POST /v1/messages          # Anthropic-compatible messages endpoint
GET  /v1/conversation      # Get conversation history  
DELETE /v1/conversation    # Reset conversation
GET  /v1/models           # List available models
GET  /usage               # View token usage and costs
```

```bash
# OpenAI-compatible endpoint
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'

# Anthropic-compatible endpoint
curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model": "anthropic/claude-3-5-sonnet", "max_tokens": 100, "messages": [{"role": "user", "content": "Hello"}]}'

# Both endpoints support the same models and share conversation context
# Client A uses OpenAI format, Client B uses Anthropic format - same conversation!

# Check usage and costs
curl http://localhost:3001/usage
```

**Multi-client proxy**: Web apps, mobile apps, and scripts share one conversation across OpenAI/OpenRouter models with automatic cost tracking.

## Development

```bash
npm run dev    # Development server
npm run build  # Build TypeScript
npm start      # Production server
```