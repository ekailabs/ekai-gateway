# Using ekai-gateway with Codex

The ekai-gateway provides multi-model routing and usage tracking capabilities that enhance your Codex experience. This guide will help you set up and use the gateway with Codex.

## Overview

ekai-gateway acts as a proxy that routes requests to different AI providers (Anthropic, OpenAI, xAI, OpenRouter) while providing usage tracking and analytics through a unified interface.

NOTE: We recommend using OpenAI gpt-5 models for the best results with Codex.

## Quick Start

### 1. Set up the Gateway

```bash
# Clone and setup the gateway
git clone https://github.com/ekailabs/ekai-gateway.git
cd ekai-gateway
npm install
npm run dev
```

### 2. Configure Environment Variables

Copy the example environment file and configure your API keys:

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your API keys
# Required: Add your API keys for the providers you want to use
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
XAI_API_KEY=your_xai_key_here
OPENROUTER_API_KEY=your_openrouter_key_here

# Optional: Custom port (defaults to 3001)
PORT=3001
```

### 3. Configure Codex

#### Option A: Using Environment Variables

Navigate to your project directory where you want to use Codex:

```bash
# Point Codex to use the gateway
export OPENAI_BASE_URL="http://localhost:3001/v1"

# Start Codex as usual
codex
```

#### Option B: Using config.toml (Recommended for Chat Completions)

For chat completions and more advanced configuration, configure the `$CODEX_HOME/config.toml` configuration file where the `CODEX_HOME` environment value defaults to `~/.codex`. (Note `CODEX_HOME` will also be where logs and other Codex-related information are stored.)

Set `model_provider = "ekai"` at the top of the config and define the provider table:

```toml
# Set the model provider to use ekai-gateway
model_provider = "ekai"

[model_providers.ekai]
name = "Ekai Gateway"
base_url = "http://localhost:3001/v1"
wire_api = "chat"
```

This configuration tells Codex to use the Ekai Gateway for chat completions. The `wire_api = "chat"` setting enables the chat completions API through the gateway.

For more configuration options, see the [Codex configuration documentation](https://github.com/openai/codex/blob/main/docs/config.md).

### 4. Monitor Usage

Open your browser and visit `http://localhost:3000` to view usage analytics and costs.

## Supported Inference Providers
   OpenAI Models (Direct)


## Model Routing Logic

The gateway automatically routes requests based on model names, finds the most optimal based on costs. 

## Benefits
- **Usage tracking**: Monitor token usage and costs across all providers
- **Cost analytics**: View detailed usage statistics in the web dashboard
- **Simplified configuration**: One gateway handles all API keys securely
- **Transparent proxying**: Works seamlessly with existing Codex workflows