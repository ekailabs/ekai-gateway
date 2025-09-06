# Pricing Configuration

AI provider pricing configuration files for the proxy.

## Structure

```
costs/
├── openai.yaml          # OpenAI (Standard tier)
├── anthropic.yaml       # Anthropic  
├── openrouter.yaml      # OpenRouter
├── templates/base.yaml  # Template for new providers
└── index.ts             # Pricing loader
```

## Adding a Provider

1. Copy `templates/base.yaml` to `provider-name.yaml`
2. Fill in the required fields:

```yaml
provider: "provider_name"
currency: "USD"
unit: "MTok"
models:
  model-name:
    input: 1.00
    output: 3.00
    # Optional caching fields:
    cached_input: 0.10         # OpenAI style
    5m_cache_write: 1.25       # Anthropic style
    1h_cache_write: 2.00       # Anthropic style  
    cache_read: 0.10           # Anthropic style
metadata:
  last_updated: "YYYY-MM-DD"
  source: "official_pricing_url"
  version: "1.0"
```

## Required Fields

- `provider`: Provider name (lowercase)
- `currency`: Currency code (e.g., "USD")
- `unit`: Token unit (e.g., "MTok" for millions)
- `models`: Model pricing object
- `metadata`: Source info and last updated date

## Model Pricing Fields

- `input`: Input token cost per 1M tokens
- `output`: Output token cost per 1M tokens

**Caching (optional):**
- `cached_input`: OpenAI cached input cost (~10% of input)
- `5m_cache_write`: Anthropic 5min cache write (~125% of input) 
- `1h_cache_write`: Anthropic 1hr cache write (~200% of input)
- `cache_read`: Anthropic cache read (~10% of input)

## Best Practices

- **Update regularly**: Check official pricing monthly
- **Use official sources**: Link to provider pricing pages in metadata
- **Include caching**: Add cache pricing where supported
- **Test changes**: Restart service and check logs for validation errors

## Examples

**OpenAI:**
```yaml
gpt-4o:
  input: 2.50
  cached_input: 1.25
  output: 10.00
```

**Anthropic:**
```yaml
claude-3-5-sonnet:
  input: 3.00
  output: 15.00
  5m_cache_write: 3.75
  1h_cache_write: 6.00
  cache_read: 0.30
```
