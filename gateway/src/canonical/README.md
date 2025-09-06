# Canonical AI Module

Universal format converter for AI provider requests/responses. Enables **any client format** to work with **any inference provider** through a canonical intermediate representation.

## 🎯 Core Concept

```
CLIENT FORMAT → CANONICAL → PROVIDER FORMAT
```

**Example**: Anthropic client → OpenAI provider
```typescript
// 1. Anthropic client request → Canonical
const canonical = anthropicAdapter.clientToCanonical(anthropicRequest);

// 2. Canonical → OpenAI provider request  
const openaiRequest = openaiAdapter.canonicalToProvider(canonical);

// 3. Send to OpenAI API → Get response
const openaiResponse = await openai.chat.completions.create(openaiRequest);

// 4. OpenAI provider response → Canonical
const canonicalResponse = openaiAdapter.providerToCanonical(openaiResponse);

// 5. Canonical → Anthropic client response
const anthropicResponse = anthropicAdapter.canonicalToClient(canonicalResponse);
```

## 📁 Structure

```
/canonical/
├── schemas/           # JSON schemas (source of truth)
├── types/            # Generated TypeScript types  
├── adapters/         # Format converters
│   ├── registry.ts   # Adapter registry
│   ├── openai/       # OpenAI format adapter
│   └── anthropic/    # Anthropic format adapter
├── validation/       # Runtime schema validation
└── index.ts         # Module exports
```

## 🚀 Usage

```typescript
import { getAdapter, initializeCanonical } from './canonical';

// Initialize (registers all adapters)
initializeCanonical();

// Get adapters by format type
const openaiAdapter = getAdapter('openai');
const anthropicAdapter = getAdapter('anthropic');

// Cross-provider transformation
const canonical = anthropicAdapter.clientToCanonical(anthropicClientReq);
const openaiProviderReq = openaiAdapter.canonicalToProvider(canonical);
```

## 🔌 Adapter Interface

Each format adapter provides 4 methods:

```typescript
interface FormatAdapter {
  // Request transformations
  clientToCanonical(clientReq): CanonicalRequest;    // Client format → Canonical
  canonicalToProvider(canonical): ProviderRequest;   // Canonical → Provider format
  
  // Response transformations  
  providerToCanonical(providerRes): CanonicalResponse; // Provider format → Canonical
  canonicalToClient(canonical): ClientResponse;        // Canonical → Client format
}
```

## 🎛️ Format Types vs Provider Names

```typescript
type FormatType = 'openai' | 'anthropic';           // API format
type ProviderName = 'openai' | 'anthropic' | 'grok'; // Actual service

const PROVIDER_FORMATS = {
  'openai': 'openai',      // OpenAI uses OpenAI format
  'anthropic': 'anthropic', // Anthropic uses Anthropic format  
  'grok': 'openai'         // Grok uses OpenAI format (when added)
};
```

## ✅ Validation

All transformations are validated against JSON schemas:

```typescript
import { canonicalValidator } from './canonical';

const validation = canonicalValidator.validateRequest(canonical);
if (!validation.valid) {
  console.error('Validation failed:', validation.errors);
}
```

## 🔄 Supported Formats

- **OpenAI**: Chat completions, tools, functions, streaming
- **Anthropic**: Messages, tools, thinking blocks, streaming

## 🧪 Testing

The module supports comprehensive testing:

1. **Round-trip tests**: Verify data integrity through transformations
2. **Cross-provider tests**: Any client → any provider combinations  
3. **Schema validation**: All canonical formats validate against schemas

---

This module enables true **any-to-any** mapping between AI clients and providers through a unified, schema-validated canonical format.