/**
 * Canonical AI Request/Response Module
 * 
 * Unified interface for AI provider requests and responses through canonical IR.
 * 
 * Usage:
 * 1. Register format adapters 
 * 2. Transform: Client → Canonical → Provider
 * 3. Validate against schemas
 * 4. Handle streaming with unified events
 */

// Core types
export * from './types/index.js';

// Validation
export { default as canonicalValidator } from './validation/canonical-validator.js';

// Registry and interfaces
export * from './adapters/registry.js';

// Format adapters
export { openaiAdapter, createOpenAIAdapter } from './adapters/openai/index.js';
export { anthropicAdapter, createAnthropicAdapter } from './adapters/anthropic/index.js';

// Utilities
export * from './adapters/core/object-map.js';

/**
 * Initialize canonical module - register all adapters
 */
export function initializeCanonical() {
  const { registerAdapter } = require('./adapters/registry.js');
  const { openaiAdapter } = require('./adapters/openai/index.js');
  const { anthropicAdapter } = require('./adapters/anthropic/index.js');
  
  registerAdapter(openaiAdapter);
  registerAdapter(anthropicAdapter);
}