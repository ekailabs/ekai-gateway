# Getting Started

This is a quick-start for running Ekai Gateway locally. For detailed client setup, see:
- [Using with Claude Code](USAGE_WITH_CLAUDE_CODE.md)
- [Using with Codex](USAGE_WITH_CODEX.md)

---

## Prerequisites

- Node.js v18 or newer  
- npm or Docker  
- At least one provider API key (OpenAI, Anthropic, xAI, or OpenRouter)

---

## Local Setup (npm)

1. Clone the repository  
   ```bash
   git clone https://github.com/ekailabs/ekai-gateway.git
   cd ekai-gateway
   ```

2. Install dependencies  
   ```bash
   npm install
   ```

3. Copy and edit the environment file  
   ```bash
   cp .env.example .env
   ```
   Add your API keys to `.env`:
   ```bash
   OPENAI_API_KEY=
   ANTHROPIC_API_KEY=
   XAI_API_KEY=
   OPENROUTER_API_KEY=
   ```

4. Build and start the Gateway  
   ```bash
   npm run build
   npm start
   ```

After startup:
- Gateway API → `http://localhost:3001`
- Dashboard → `http://localhost:3000`

You can now send requests through the Gateway.

---

## Docker Setup

```bash
cp .env.example .env
# Add API keys
docker compose up --build -d
```

This runs both the Gateway API (3001) and Dashboard (3000). Visit `http://localhost:3000` to confirm the dashboard is active.

---

## Environment Variables

| Variable | Description |
|-----------|-------------|
| `OPENAI_API_KEY` | Key for OpenAI models |
| `ANTHROPIC_API_KEY` | Key for Anthropic models |
| `XAI_API_KEY` | Key for xAI Grok models |
| `OPENROUTER_API_KEY` | Key for OpenRouter models |
| `PORT_GATEWAY` | Port for Gateway API (default 3001) |
| `PORT_DASHBOARD` | Port for Dashboard UI (default 3000) |
| `DATABASE_PATH` | SQLite file path (default `data/usage.db`) |

---

## Running the Gateway and Dashboard

When you start the services:

- The Gateway listens for OpenAI and Anthropic API calls on `http://localhost:3001`.  
- The Dashboard runs at `http://localhost:3000` and automatically reads usage data.  
- A new SQLite database file is created the first time you send a request.

---

## Using with Clients (Summary)

- Claude Code
  - Set `ANTHROPIC_BASE_URL=http://localhost:3001`
  - Pick a model (e.g., `claude-sonnet-4-20250514`, `grok-code-fast-1`)
  - Full guide → [USAGE_WITH_CLAUDE_CODE.md](USAGE_WITH_CLAUDE_CODE.md)

- Codex
  - Set `OPENAI_BASE_URL=http://localhost:3001/v1`
  - Optional: configure `$CODEX_HOME/config.toml` with `model_provider = "ekai"`
  - Full guide → [USAGE_WITH_CODEX.md](USAGE_WITH_CODEX.md)

---

## Next Steps

- Explore the Dashboard at `http://localhost:3000`
- Try switching models (`claude-sonnet-4-20250514`, `gpt-4o`, `grok-code-fast-1`)
- Read the detailed guides for Claude Code and Codex
