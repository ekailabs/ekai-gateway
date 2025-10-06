# Using ekai-gateway with Codex

The ekai-gateway provides multi-model routing and usage tracking capabilities that enhance your Codex experience. This guide will help you set up and use the gateway with Codex.

## Overview

ekai-gateway acts as a proxy that routes requests to different AI providers (Anthropic, OpenAI, xAI, OpenRouter) while providing usage tracking and analytics through a unified interface.

NOTE: Codex works well with OpenAI and xAI models. You can use OpenAI GPT models or xAI Grok models via the gateway.

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

Create a `.env` file in the gateway root directory:

```bash
# Required: Add your API keys for the providers you want to use
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
XAI_API_KEY=your_xai_key_here
OPENROUTER_API_KEY=your_openrouter_key_here

# Optional: Custom port (defaults to 3001)
PORT=3001
```

### 3. Configure Codex

Navigate to your project directory where you want to use Codex:

```bash
# Point Codex to use the gateway (OpenAI-compatible base URL)
export OPENAI_BASE_URL="http://localhost:3001/v1"

# Pick a model (examples)
# OpenAI GPT model
export OPENAI_MODEL="gpt-4o"
# xAI Grok model (routes to xAI Responses)
export OPENAI_MODEL="grok-code-fast-1"
# You can also select models in Codex settings if supported

# Start Codex as usual
codex
```

### 4. Monitor Usage

Open your browser and visit `http://localhost:3000` to view usage analytics and costs.

## Supported Inference Providers
1. OpenAI Models (Direct)
2. xAI Models (Grok via Responses API)
3. Anthropic Models (Direct)
4. OpenRouter Models


## Model Routing Logic

The gateway automatically routes requests based on model names and cost:
- Grok models (e.g., `grok-code-fast-1`, `grok-4`) → xAI (if `XAI_API_KEY` is set)
- Other models are routed to the cheapest available configured provider

## Benefits
- **Usage tracking**: Monitor token usage and costs across all providers
- **Cost analytics**: View detailed usage statistics in the web dashboard
- **Simplified configuration**: One gateway handles all API keys securely
- **Transparent proxying**: Works seamlessly with existing Codex workflows
