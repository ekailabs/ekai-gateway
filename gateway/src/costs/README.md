# Pricing Configuration

This folder contains pricing configuration files for all AI providers supported by the proxy.

## File Structure

```
costs/
├── openai.yaml          # OpenAI pricing
├── openrouter.yaml      # OpenRouter pricing
├── templates/           # Templates for new providers
│   └── base.yaml       # Base template
└── README.md            # This file
```

## Adding a New Provider

### 1. Create a new YAML file

Copy the base template and modify it:

```bash
cp templates/base.yaml groq.yaml
```

### 2. Fill in the provider details

```yaml
provider: "groq"
currency: "USD"
unit: "per_1m_tokens"
models:
  llama-3-8b-8192:
    input: 0.05
    output: 0.10
    description: "Llama 3 8B model on Groq"
    model_type: "llama"
  llama-3-70b-8192:
    input: 0.59
    output: 0.87
    description: "Llama 3 70B model on Groq"
    model_type: "llama"
metadata:
  last_updated: "2024-01-15"
  source: "official_groq_pricing"
  notes: "Prices in USD per 1M tokens"
  version: "1.0"
  contributor: "your_github_handle"
```

### 3. Required Fields

- **provider**: Provider name (lowercase, no spaces)
- **currency**: Currency code (USD, EUR, etc.)
- **unit**: Pricing unit (per_1k_tokens, per_token, etc.)
- **models**: Object with model names as keys
- **metadata**: Information about the pricing data

### 4. Model Fields

- **input**: Cost per 1M input tokens
- **output**: Cost per 1M output tokens  
- **original_provider**: If via aggregator (e.g., OpenRouter)
- **region**: For regional pricing (optional)
- **tier**: For tiered pricing (optional)

### 5. Optional Fields

- **original_provider**: If via aggregator (e.g., OpenRouter)
- **region**: For regional pricing
- **tier**: For tiered pricing
- **contributor**: Your GitHub handle for attribution

## Updating Existing Pricing

### 1. Edit the YAML file directly

```yaml
# Update the price
models:
  gpt-4o:
    input: 2.50  # Old price
    output: 10.00
    # ... other fields
```

### 2. Update metadata

```yaml
metadata:
  last_updated: "2024-01-20"  # Update date
  notes: "Updated pricing for January 2024"
```

## Validation

The system automatically validates:

- Required fields are present
- YAML syntax is correct
- Pricing values are numbers
- File naming follows conventions

## Best Practices

### 1. **Keep prices current**
- Update pricing monthly or when providers change rates
- Use official pricing sources when possible

### 2. **Be descriptive**
- Clear model descriptions help users understand what they're paying for
- Include model family information

### 3. **Document sources**
- Always include pricing source in metadata
- Note if prices include any markups

### 4. **Test your changes**
- The system will log when pricing is loaded
- Check console output for validation errors

## Example: Adding Groq Pricing

```yaml
provider: "groq"
currency: "USD"
unit: "per_1m_tokens"
models:
  llama-3-8b-8192:
    input: 0.05
    output: 0.10
  llama-3-70b-8192:
    input: 0.59
    output: 0.87
  mixtral-8x7b-32768:
    input: 0.24
    output: 0.24
metadata:
  last_updated: "2024-01-15"
  source: "official_groq_pricing"
  notes: "Prices in USD per 1M tokens"
  version: "1.0"
  contributor: "github_username"
```

## Need Help?

- Check existing YAML files for examples
- Use the base template as a starting point
- Ensure YAML syntax is correct (use a YAML validator)
- Test by restarting the service and checking console logs

## Contributing

1. Fork the repository
2. Create your pricing file
3. Test that it loads correctly
4. Submit a pull request
5. Include a brief description of what you added/updated

Thank you for helping keep the pricing up to date! 🚀
