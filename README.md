# OpenRouter Proxy Backend

Backend proxy for OpenRouter AI models. Simple API to access 100+ AI models with API key security.

## Features

- 🤖 **Multi-model**: Access to 100+ AI models through OpenRouter
- 🔒 **API Key Security**: End-users do not need API keys
- 🚀 **Simple Setup**: Minimal configuration required
- ⚡ **Fast**: Direct proxy to OpenRouter with minimal overhead

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or pnpm
- OpenRouter API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd proxy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Create .env file with your OpenRouter API key
   echo "OPENROUTER_API_KEY=your_api_key_here" > .env
   ```

4. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `OPENROUTER_API_KEY` | Your OpenRouter API key | **Required** |

## API Endpoints

### Health Check
```http
GET /health
```

### Get Available Models
```http
GET /v1/models
```

### Chat Completions
```http
POST /v1/chat/completions
```

**Example Usage**:

OpenRouter models (with `/` in model name):
```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-3.5-sonnet",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

OpenAI models (without `/` in model name):
```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

The proxy automatically routes requests:
- Models with `/` (e.g., `anthropic/claude-3.5-sonnet`) → OpenRouter
- Models without `/` (e.g., `gpt-4o`) → OpenAI

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run clean` - Clean build artifacts