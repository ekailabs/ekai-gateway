/**
 * Adapter Registry Tests
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { 
  registerAdapter, 
  getAdapter, 
  getProviderAdapter,
  clearRegistry,
  PROVIDER_FORMATS,
  type FormatType,
  type ProviderName
} from '../../../adapters/registry.js';
import { openaiAdapter } from '../../../adapters/openai/index.js';
import { anthropicAdapter } from '../../../adapters/anthropic/index.js';

describe('Adapter Registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe('Format Adapter Registration', () => {
    test('registers and retrieves format adapters', () => {
      registerAdapter(openaiAdapter);
      
      const retrieved = getAdapter('openai');
      expect(retrieved).toBe(openaiAdapter);
      expect(retrieved.formatType).toBe('openai');
    });

    test('throws error for unregistered format', () => {
      expect(() => getAdapter('openai')).toThrow('No adapter for format: openai');
    });

    test('registers multiple adapters', () => {
      registerAdapter(openaiAdapter);
      registerAdapter(anthropicAdapter);
      
      const openaiRetrieved = getAdapter('openai');
      const anthropicRetrieved = getAdapter('anthropic');
      
      expect(openaiRetrieved.formatType).toBe('openai');
      expect(anthropicRetrieved.formatType).toBe('anthropic');
    });
  });

  describe('Provider Adapter Resolution', () => {
    beforeEach(() => {
      registerAdapter(openaiAdapter);
      registerAdapter(anthropicAdapter);
    });

    test('resolves provider to correct format adapter', () => {
      const openaiProviderAdapter = getProviderAdapter('openai');
      const anthropicProviderAdapter = getProviderAdapter('anthropic');
      
      expect(openaiProviderAdapter.formatType).toBe('openai');
      expect(anthropicProviderAdapter.formatType).toBe('anthropic');
    });

    test('throws error for unknown provider', () => {
      expect(() => getProviderAdapter('unknown' as ProviderName)).toThrow('Unknown provider: unknown');
    });

    test('provider formats mapping is correct', () => {
      expect(PROVIDER_FORMATS.openai).toBe('openai');
      expect(PROVIDER_FORMATS.anthropic).toBe('anthropic');
    });
  });

  describe('Registry State Management', () => {
    test('clearRegistry removes all adapters', () => {
      registerAdapter(openaiAdapter);
      registerAdapter(anthropicAdapter);
      
      // Verify they're registered
      expect(() => getAdapter('openai')).not.toThrow();
      expect(() => getAdapter('anthropic')).not.toThrow();
      
      clearRegistry();
      
      // Verify they're removed
      expect(() => getAdapter('openai')).toThrow();
      expect(() => getAdapter('anthropic')).toThrow();
    });

    test('registry is isolated per test', () => {
      // This test should start with empty registry due to beforeEach
      expect(() => getAdapter('openai')).toThrow();
    });
  });

  describe('Adapter Interface Validation', () => {
    test('registered adapters have required methods', () => {
      registerAdapter(openaiAdapter);
      const adapter = getAdapter('openai');
      
      expect(typeof adapter.clientToCanonical).toBe('function');
      expect(typeof adapter.canonicalToClient).toBe('function');
      expect(typeof adapter.canonicalToProvider).toBe('function');
      expect(typeof adapter.providerToCanonical).toBe('function');
      expect(adapter.stream).toBeDefined();
      expect(typeof adapter.stream.sourceToCanonical).toBe('function');
    });

    test('adapters have correct format types', () => {
      registerAdapter(openaiAdapter);
      registerAdapter(anthropicAdapter);
      
      expect(openaiAdapter.formatType).toBe('openai');
      expect(anthropicAdapter.formatType).toBe('anthropic');
      
      // Verify type consistency
      const openaiFormatTypes: FormatType[] = ['openai'];
      const anthropicFormatTypes: FormatType[] = ['anthropic'];
      
      expect(openaiFormatTypes).toContain(openaiAdapter.formatType);
      expect(anthropicFormatTypes).toContain(anthropicAdapter.formatType);
    });
  });

  describe('Provider Format Mapping', () => {
    test('PROVIDER_FORMATS contains all expected providers', () => {
      const expectedProviders: ProviderName[] = ['openai', 'anthropic'];
      
      expectedProviders.forEach(provider => {
        expect(PROVIDER_FORMATS[provider]).toBeDefined();
      });
    });

    test('all provider formats are valid format types', () => {
      const validFormatTypes: FormatType[] = ['openai', 'anthropic'];
      
      Object.values(PROVIDER_FORMATS).forEach(formatType => {
        expect(validFormatTypes).toContain(formatType);
      });
    });

    test('provider names and format types have correct relationship', () => {
      // Current 1:1 mapping
      expect(PROVIDER_FORMATS.openai).toBe('openai');
      expect(PROVIDER_FORMATS.anthropic).toBe('anthropic');
      
      // This documents current state - when we add Grok, this test will change
      // to expect: PROVIDER_FORMATS.grok === 'openai'
    });
  });
});