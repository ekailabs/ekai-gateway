# Canonical Schema Documentation

## Overview

This directory contains modular JSON schemas that define a universal format for AI provider requests and responses. The schemas are designed to work with multiple AI providers (OpenAI, Anthropic, Google, etc.) through a single, unified interface.

## File Structure

```
schemas/
├── README.md                           # This documentation
├── request.schema.json                 # Original monolithic request schema
├── request-modular.schema.json         # New modular request schema
├── response.schema.json                # Response schema  
├── streaming-response.schema.json      # Streaming response schema
└── definitions/                        # Modular definitions
    ├── base.json                       # Common types and utilities
    ├── content-types.json              # Multi-modal content definitions
    ├── generation.json                 # Generation parameters
    └── tools.json                      # Tool/function calling definitions
```

## Modular Schema Benefits

### 🔧 **Maintainability**
- **Focused files**: Each file handles one specific concern
- **Easy updates**: Change generation parameters without touching content types
- **Clear organization**: Developers can quickly find what they need

### 📖 **Readability** 
- **Smaller files**: 50-150 lines vs 600+ lines
- **Clear names**: `generation.json` vs hunting through a massive file
- **Better documentation**: Each module can have focused descriptions

### 🔄 **Reusability**
- **Shared definitions**: Content types can be used in both request and response schemas
- **Mix and match**: Build new schemas by combining existing modules
- **Version control**: Update individual modules independently

## Schema Modules

### `base.json`
**Common utilities and configuration types**
- Safety settings and content filtering
- Response format controls (text, JSON, structured)
- Audio settings and stream options
- Provider parameters and metadata
- Context and caching information

### `content-types.json` 
**Multi-modal input handling**
- Text content with length validation
- Images (base64 or URL, multiple formats)
- Audio files (WAV, MP3, AAC, etc.)
- Video content (MP4, WebM, etc.)  
- Documents (PDF, HTML, Markdown)
- Tool results and conversation messages

### `generation.json`
**AI model generation controls**
- Core parameters: `max_tokens`, `temperature`, `top_p`
- Sampling controls: `top_k`, `frequency_penalty`, `presence_penalty` 
- Stop sequences and seed values
- Output modalities and reasoning effort
- Service tiers and processing options

### `tools.json`
**Function and tool calling**
- Modern tool definitions (OpenAI/Anthropic style)
- Legacy function calling (backwards compatibility)
- Tool choice strategies (auto, none, specific)
- Parallel execution controls

## Usage Examples

### Basic Text Request
```json
{
  "schema_version": "1.0.1",
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Hello, world!"
    }
  ]
}
```

### Multi-modal with Tools
```json
{
  "schema_version": "1.0.1", 
  "model": "claude-3-5-sonnet",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "What's in this image?"},
        {"type": "image", "source": {"type": "url", "url": "https://example.com/image.jpg"}}
      ]
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "identify_objects",
        "description": "Identify objects in an image",
        "parameters": {"type": "object", "properties": {"objects": {"type": "array"}}}
      }
    }
  ],
  "generation": {
    "max_tokens": 500,
    "temperature": 0.7
  }
}
```

### Provider-Specific Parameters
```json
{
  "schema_version": "1.0.1",
  "model": "gpt-4",
  "messages": [...],
  "provider_params": {
    "openai": {
      "logit_bias": {"50256": -100},
      "user": "customer-123"
    },
    "anthropic": {
      "metadata": {"user_id": "customer-123"}
    }
  }
}
```

## Migration Guide

### From Monolithic to Modular

**Old way:**
```bash
# Single large file
curl -X POST /validate \
  --data @request.schema.json
```

**New way:**
```bash  
# Main schema with references
curl -X POST /validate \
  --data @request-modular.schema.json
```

The modular schema maintains **100% compatibility** with existing requests - only the internal organization has changed.

### Schema Validation

Most JSON Schema validators support `$ref` automatically:

```javascript
// Node.js with Ajv
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({allErrors: true});
addFormats(ajv);

// Load schemas
const requestSchema = require('./request-modular.schema.json');
const contentTypes = require('./definitions/content-types.json');
const generation = require('./definitions/generation.json');
// ... load other modules

// Validate
const validate = ajv.compile(requestSchema);
const valid = validate(requestData);
```

## Development Tips

### Adding New Features
1. **Determine scope**: Which module should contain the new feature?
2. **Update definition**: Add to the appropriate `definitions/*.json` file
3. **Reference in main**: Add reference in `request-modular.schema.json`
4. **Test thoroughly**: Ensure references resolve correctly

### Schema Evolution  
- **Backwards compatibility**: Always maintain compatibility when possible
- **Version bumping**: Update `schema_version` for breaking changes
- **Documentation**: Update this README when adding new modules

## Testing

```bash
# Validate a request against the modular schema
npx ajv validate -s request-modular.schema.json -d example-request.json

# Test all modules resolve correctly  
npx ajv compile -s request-modular.schema.json
```

## Future Enhancements

### Planned Modules
- `providers/`: Provider-specific schema extensions
- `validation/`: Custom validation rules and constraints  
- `examples/`: Schema examples for common use cases
- `migrations/`: Schema version migration utilities

This modular approach makes the schemas much easier to work with while maintaining full compatibility with existing systems.