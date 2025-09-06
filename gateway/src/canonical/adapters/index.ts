/**
 * Adapters module - Registry-based provider adapters
 * 
 * This module provides a clean, table-driven approach to converting
 * between canonical format and provider-specific formats.
 * 
 * Architecture:
 * - Registry: Strategy pattern for adapter lookup
 * - Core utilities: Table-driven mapping and validation
 * - Provider adapters: OpenAI, Anthropic, and future providers
 * 
 * Key benefits:
 * - No if/else chains - pure strategy dispatch
 * - Table-driven mappings - 90% declarative
 * - Pure functions for special cases - easy to test
 * - Lossless conversion - preserves provider_raw data
 */

// Core registry and interfaces
export * from './registry.js';

// Core utilities
export * from './core/object-map.js';
export * from './core/validation.js';

// Provider adapters (legacy - incomplete)
export { openaiAdapter, createOpenAIAdapter } from './openai/index.js';
export { anthropicAdapter, createAnthropicAdapter } from './anthropic/index.js';

// Enhanced adapters (complete - recommended)
// export { 
//   registerEnhancedAdapters,
//   enhancedOpenAIAdapter,
//   enhancedAnthropicAdapter 
// } from './enhanced/index.js';

// Convenience function to register all adapters
import { registerAdapter } from './registry.js';
import { openaiAdapter } from './openai/index.js';
import { anthropicAdapter } from './anthropic/index.js';

/**
 * Register all available adapters (legacy - incomplete)
 * ⚠️  DEPRECATED: Use registerEnhancedAdapters() instead
 * Call this once during application initialization
 */
export function registerAllAdapters(): void {
  registerAdapter(openaiAdapter);
  registerAdapter(anthropicAdapter);
}

/**
 * Register enhanced adapters (recommended)
 * ✅ Complete field mapping and lossless conversion
 * Call this instead of registerAllAdapters() for full functionality
 */
// export { registerEnhancedAdapters as registerCompleteAdapters } from './enhanced/index.js';

/**
 * Usage examples:
 * 
 * // Initialize adapters
 * import { registerAllAdapters, getAdapter } from './adapters';
 * registerAllAdapters();
 * 
 * // Use adapters (no if/else needed!)
 * const adapter = getAdapter('openai');
 * const providerReq = adapter.toProviderRequest(canonicalRequest);
 * const canonicalRes = adapter.fromProviderResponse(providerResponse);
 * 
 * // Handle streaming
 * const events = adapter.stream.toCanonical(streamEvent);
 * 
 * // With validation
 * import { withValidation } from './adapters';
 * const validatedAdapter = withValidation(openaiAdapter);
 */