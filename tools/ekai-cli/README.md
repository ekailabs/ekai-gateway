# ekai-cli

A clean, interactive CLI launcher for integrating the Ekai Gateway with Claude CLI and Codex CLI.

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

### `ekai up [options]`

Start the Ekai Gateway and/or Dashboard.

**Options:**
- `--workspace <path>`, `-w` - Override workspace path
- `--gateway-only` - Start only the gateway
- `--ui-only` - Start only the dashboard
- `--mode <dev|prod>` - Run in dev or production mode

**Examples:**
```bash
ekai up
ekai up --gateway-only
ekai up --mode prod
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` in the workspace root and add at least one provider key (Anthropic, OpenAI, Google Gemini, xAI, or OpenRouter). See the root README for full details.

### CLI Config

Optional configuration file at `~/.ekai/config.json`:

```json
{
  "gatewayUrl": "http://localhost:3001",
  "port": "3001",
  "workspacePath": "/path/to/ekai-gateway"
}
```

### Gateway URL

The CLI detects the gateway URL in this order:
1. `EKAI_GATEWAY_URL` environment variable
2. `gatewayUrl` in `~/.ekai/config.json`
3. `PORT` environment variable (default: 3001)
4. Default: `http://localhost:3001`

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


