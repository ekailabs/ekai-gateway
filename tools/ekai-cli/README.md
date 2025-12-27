# Ekai CLI

A clean, interactive CLI launcher for integrating the Ekai Gateway with Claude CLI and Codex CLI.

## Commands at a Glance

- `ekai init` — Create/update `~/.ekai/.env` with provider keys (masked prompts).
- `ekai claude` / `ekai codex` — Launch either CLI through the gateway with model selection.
- `ekai up` (`ekai serve` / `ekai start`) — Start gateway + dashboard locally or via Docker.
- `ekai models` — List compatible models with provider/key status.

## Installation

From the repo root, install the CLI globally once (this also records the workspace path for `.env` loading):

```bash
npm run cli:install           # builds + npm link; adds `ekai` to your PATH
```

Now you can run `ekai ...` from any directory. Remove it later with `npm unlink -g ekai`.

## Prerequisites

1. **Ekai Gateway repo** - Clone `ekai-gateway` and run `npm install` at the repo root
2. **Claude CLI** (for `ekai claude`) - Install via `npm install -g @anthropic-ai/claude-cli`
3. **Codex CLI** (for `ekai codex`) - Install via `npm install -g @cursor/codex-cli`

## Quick Start

You must run `npm run cli:install` first so `ekai` is on your PATH.

0. **(Optional) Prime your API keys**:
   ```bash
   ekai init
   ```

1. **Start the gateway/dashboard** (in a separate terminal):
   ```bash
   ekai up
   ```

2. **Launch Claude or Codex**:
   ```bash
   ekai claude
   ekai codex
   ```

3. **Or specify a model directly**:
   ```bash
   ekai claude --model claude-sonnet-4-5
   ekai codex --model gpt-4o-mini
   ```

## Local Workspace vs Docker Runtime

`ekai up` prefers your local checkout (so `npm run dev` and `npm run start` keep working), but it now falls back to the published Docker image if it can’t find a workspace—or if you force it via `ekai up --runtime docker`.

**To run with Docker only:**

1. Create an env file once (the CLI auto-detects `~/.ekai/.env`):
   ```bash
   mkdir -p ~/.ekai
   cp path/to/.env.example ~/.ekai/.env   # then edit keys
   ```
2. Launch the containerized gateway:
   ```bash
   ekai up --runtime docker
   ```

Volumes for `/app/gateway/data` and `/app/gateway/logs` are mounted under `~/.ekai/runtime`, and you can override ports, image tags, or env files with flags (see below).

## Commands

### `ekai claude [options]`

Launch Claude CLI with Ekai Gateway integration.

**Options:**
- `--model <name>`, `-m` - Specify model name (interactive selection if omitted)
- `--skip-version-check` - Skip Claude CLI version validation

**Examples:**
```bash
ekai claude
ekai claude --model claude-haiku-4-5
ekai claude -m claude-opus-4-5
```

### `ekai codex [options]`

Launch Codex CLI with Ekai Gateway integration.

**Options:**
- `--model <name>`, `-m` - Specify model name (interactive selection if omitted)
- `--skip-version-check` - Skip Codex CLI version validation

**Examples:**
```bash
ekai codex
ekai codex --model gpt-5
ekai codex -m gemini-2.5-flash
```

### `ekai models`

List all compatible models available through the gateway.

**Options:**
- `--all` - Show all models (default: first 15)
- `--provider <name>` - Filter by provider (anthropic, openai, xai, openrouter)

**Examples:**
```bash
ekai models
ekai models --all
ekai models --provider anthropic
```

### `ekai init`

Write provider API keys to `~/.ekai/.env` with masked prompts and safe permissions (0600). Existing keys are preserved unless you enter a new value. Run this once when setting up a machine.

### `ekai up [options]`

Start the Ekai Gateway and/or Dashboard. Also available as `ekai serve` or `ekai start`.

**Options:**
- `--workspace <path>`, `-w` - Override workspace path
- `--gateway-only` - Start only the gateway
- `--ui-only` - Start only the dashboard
- `--mode <dev|prod>` - Run in dev or production mode
- `--runtime <local|docker>` - Force a local workspace or the Docker runtime
- `--image <name>` - Override Docker image (default `ghcr.io/ekailabs/ekai-gateway:latest`)
- `--env-file <path>` - Pass a specific `.env` when running via Docker (defaults to `~/.ekai/.env` if present)
- `--port <number>` / `--ui-port <number>` - Control host port mappings (default 3001/3000)
- `--skip-pull` - Skip `docker pull` when you already have the image locally

**Examples:**
```bash
ekai up
ekai up --gateway-only
ekai up --mode prod
```

**Workspace resolution order:** `--workspace` flag → `EKAI_WORKSPACE` env → `~/.ekai/config.json` → current repo root. If none is found, the CLI automatically falls back to Docker (unless `--runtime local` is set).

**Env loading order for `ekai up`:** process env → `~/.ekai/config.json` `env` block → `~/.ekai/.env` → `<workspace>/.env`.

## Configuration

### Environment Variables

Copy `.env.example` to `.env` in the workspace root and add at least one provider key (Anthropic, OpenAI, Google Gemini, xAI, or OpenRouter). See the root README for full details.

When you rely on the Docker runtime, the CLI looks for env vars in this order: `--env-file` flag → `EKAI_ENV_FILE` → the current working directory’s `.env` → `~/.ekai/.env`. Storing secrets in `~/.ekai/.env` keeps them reusable even when you’re not in the repo.

### CLI Config

Optional configuration file at `~/.ekai/config.json`:

```json
{
  "workspacePath": "/path/to/ekai-gateway",
  "gatewayUrl": "http://localhost:3001",
  "port": "3001",
  "uiPort": "3000",
  "containerImage": "ghcr.io/ekailabs/ekai-gateway:latest"
}
```

The CLI also honors an `env` object inside that file to set persistent environment variables (merged after `process.env` but before `.env` files).

## Troubleshooting

### Gateway Unreachable

```
✖ Gateway unreachable at http://localhost:3001
   Start it in a separate terminal:
   $ ekai up
```

**Solution:** Start the gateway first using `ekai up` (or `npm run dev`).

### Tool Not Found

```
✖ claude not found in PATH
   Please install claude first:
   $ npm install -g @anthropic-ai/claude-cli
```

**Solution:** Install the required CLI tool globally.

### Config File Errors

If you see errors about `config.toml` (for Codex):

- Check file permissions in `~/.codex/`
- Ensure `CODEX_HOME` is set to a writable location
- Try running with elevated permissions if needed

### Catalog Not Found

If model lists are empty, the catalog files may not be synced. Run:

```bash
npm run sync:catalog --workspace=tools/ekai-cli
```

## Version Requirements

- **Claude CLI**: >= 2.0.0
- **Codex CLI**: >= 0.63.0

Use `--skip-version-check` to bypass version validation.


