# 3. Getting Started

This guide shows how to install, configure, and use the Ekai Gateway locally.  
You’ll learn how to start the Gateway and Dashboard, send your first requests, and connect clients like Codex or Claude Code.

---

## 3.1 Prerequisites

- Node.js v18 or newer  
- npm or Docker  
- At least one provider API key (OpenAI, Anthropic, xAI, or OpenRouter)

---

## 3.2 Local Setup (npm)

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
- Gateway API → [http://localhost:3001](http://localhost:3001)  
- Dashboard → [http://localhost:3000](http://localhost:3000)

You can now send requests through the Gateway.

---

## 3.3 Docker Setup

```bash
cp .env.example .env
# Add API keys
docker compose up --build -d
```

This runs both the Gateway API (3001) and Dashboard (3000).  
Visit [http://localhost:3000](http://localhost:3000) to check that the dashboard is active.

---

## 3.4 Environment Variables

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

## 3.5 Running the Gateway and Dashboard

When you start the services:

- The Gateway listens for OpenAI and Anthropic API calls on `http://localhost:3001`.  
- The Dashboard runs at `http://localhost:3000` and automatically reads usage data.  
- A new SQLite database file is created the first time you send a request.

---

## 3.6 Using the Gateway with Clients

### Claude Code
Set the base URL:
```bash
export ANTHROPIC_BASE_URL=http://localhost:3001
```
Start Claude Code. All requests will route through the Gateway and appear in the Dashboard.

### Codex or OpenAI SDKs
Set:
```bash
export OPENAI_BASE_URL=http://localhost:3001/v1
```
Start Codex or your custom client. The Gateway will forward requests to the correct provider and record usage automatically.

---

## 3.7 Next Steps

- Explore the Dashboard at [http://localhost:3000](http://localhost:3000)  
- Try switching between models (`claude-3-opus`, `gpt-4o`, `grok-beta`)  
- Continue to **Usage and Integration** to learn more about available endpoints and request formats.
