# Using ekai-gateway with Claude Code

The ekai-gateway provides multi-model routing and usage tracking capabilities that enhance your Claude Code experience. This guide will help you set up and use the gateway with Claude Code.

## Overview

ekai-gateway acts as a proxy that routes requests to different AI providers (Anthropic, OpenAI, xAI, OpenRouter) while providing usage tracking and analytics through a unified interface.

NOTE: We recommend using Anthropic and xAI models for the best results with Claude Code.

## Quick Start

### 1. Set up the Gateway

```bash
# Clone and setup the gateway
git clone <repository-url>
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

### 3. Configure Claude Code

Navigate to your project directory where you want to use Claude Code:

```bash
# Set the model (examples below)
export ANTHROPIC_MODEL="claude-sonnet-4-20250514"  # Default Anthropic model
export ANTHROPIC_MODEL="grok-code-fast"              # xAI model
export ANTHROPIC_MODEL="gpt-4o"                      # OpenAI model
export ANTHROPIC_MODEL="moonshotai/kimi-k2"         # OpenRouter model

# Point Claude Code to use the gateway
export ANTHROPIC_BASE_URL="http://localhost:3001"

# Start Claude Code as usual
claude
```

## Model Switching

Currently, there are two ways to switch models:

### Method 1: Environment Variable (Current)
Change the `ANTHROPIC_MODEL` environment variable and restart Claude Code:

```bash
# Switch to a different model
export ANTHROPIC_MODEL="grok-code-fast"  # Switch to xAI Grok
claude  # Restart Claude Code

# Or switch to OpenAI model
export ANTHROPIC_MODEL="gpt-4o"
claude  # Restart Claude Code
```

### Method 2: Interactive Selection

/models in claude to switch

### Method 3: Multiple Terminal Sessions
Run multiple Claude Code instances with different models in separate terminals:

```bash
# Terminal 1 - Anthropic model
export ANTHROPIC_MODEL="claude-sonnet-4-20250514"
export ANTHROPIC_BASE_URL="http://localhost:3001"
claude

# Terminal 2 - xAI model  
export ANTHROPIC_MODEL="grok-code-fast"
export ANTHROPIC_BASE_URL="http://localhost:3001"
claude
```



### 4. Monitor Usage

Open your browser and visit `http://localhost:3000` to view usage analytics and costs.

## Supported Models

The gateway supports models from multiple providers. You can see all available models by calling:

### Popular Models by Provider

**Anthropic Models:**
- `claude-sonnet-4-20250514` - Latest Claude Sonnet (recommended)
- `claude-3-5-sonnet-20241022` - Claude 3.5 Sonnet
- `claude-opus-4.1` - Claude Opus (most capable)

**xAI Models:**
- `grok-code-fast` - Fast coding model (recommended for development)
- `grok-4` - Latest Grok model

**OpenAI Models:**
- `gpt-4o` - GPT-4 Omni
- `gpt-5` - Latest GPT-5
- `gpt-5-mini` - Efficient GPT-5 variant

**OpenRouter Models:**
- `moonshotai/kimi-k2` - Moonshot AI model
- `google/gemini-2.5-flash` - Google Gemini
- `deepseek/deepseek-chat-v3.1` - DeepSeek model

## Supported Inference Providers
1. Anthropic Models (Direct)
2. xAI Models
3. OpenAI Models
4. OpenRouter Models

## Model Routing Logic

The gateway automatically routes requests based on model names, finds the most optimal based on costs. 

## Benefits
- **Multi-provider support**: Access models from multiple providers through one interface
- **Usage tracking**: Monitor token usage and costs across all providers
- **Cost analytics**: View detailed usage statistics in the web dashboard
- **Simplified configuration**: One gateway handles all API keys securely
- **Transparent proxying**: Works seamlessly with existing Claude Code workflows


### Using with Different Claude Code Instances
You can run multiple Claude Code instances with different models by setting different environment variables in each terminal session.
