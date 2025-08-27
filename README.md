# AI Proxy Backend

Multi-provider AI proxy with shared conversations across clients. Supports OpenAI and OpenRouter models through one API.

## Features

- 🤖 **Multi-provider**: OpenAI + OpenRouter models
- 💬 **Shared conversations**: Context across all clients  
- 🧠 **Auto context**: Single messages include conversation history

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
POST /v1/chat/completions  # Chat with any model
GET  /v1/conversation      # Get conversation history  
DELETE /v1/conversation    # Reset conversation
GET  /v1/models           # List available models
```

```bash
# Chat with OpenAI models
curl -X POST http://localhost:3001/v1/chat/completions \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'

# Chat with OpenRouter models (use model/provider format)
curl -X POST http://localhost:3001/v1/chat/completions \
  -d '{"model": "anthropic/claude-3.5-sonnet", "messages": [{"role": "user", "content": "Hello"}]}'

# Multiple clients share the same conversation
# Client A sends a message, Client B continues with context automatically included
```

**Multi-client proxy**: Web apps, mobile apps, and scripts share one conversation across OpenAI/OpenRouter models.

## Development

```bash
npm run dev    # Development server
npm run build  # Build TypeScript
npm start      # Production server
```