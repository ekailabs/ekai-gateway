/**
 * Round-trip tests - verify data integrity through transformations
 */

import { describe, test, expect } from 'vitest';
import { openaiAdapter } from '../../adapters/openai/index.js';
import { anthropicAdapter } from '../../adapters/anthropic/index.js';
import { mockOpenAIRequest, mockOpenAIResponse, mockAnthropicRequest, mockAnthropicResponse, mockOpenAIToolRequest, mockAnthropicToolRequest } from '../helpers/mock-data.js';
import { deepEqual } from '../helpers/test-utils.js';

describe('Round-Trip Data Integrity', () => {
  describe('OpenAI Round-Trip', () => {
    test('basic request round-trip preserves structure', () => {
      // Client → Canonical → Provider → Canonical → Client
      const canonical1 = openaiAdapter.clientToCanonical(mockOpenAIRequest);
      const providerRequest = openaiAdapter.canonicalToProvider(canonical1);
      
      // Simulate provider response (would come from actual API)
      const canonical2 = openaiAdapter.providerToCanonical(mockOpenAIResponse);
      const clientResponse = openaiAdapter.canonicalToClient(canonical2);
      
      // Key fields should be preserved
      expect(clientResponse.model).toBe(mockOpenAIResponse.model);
      expect(clientResponse.id).toBe(mockOpenAIResponse.id);
      expect(clientResponse.object).toBe('chat.completion');
      expect(clientResponse.choices.length).toBe(mockOpenAIResponse.choices.length);
      expect(clientResponse.usage.total_tokens).toBe(mockOpenAIResponse.usage.total_tokens);
    });

    test('tool request round-trip preserves tool definitions', () => {
      const canonical = openaiAdapter.clientToCanonical(mockOpenAIToolRequest);
      const providerRequest = openaiAdapter.canonicalToProvider(canonical);
      
      // Tool structure should be preserved
      expect(providerRequest.tools).toBeDefined();
      expect(providerRequest.tools!.length).toBe(mockOpenAIToolRequest.tools!.length);
      expect(providerRequest.tools![0].function.name).toBe(mockOpenAIToolRequest.tools![0].function.name);
      expect(providerRequest.tool_choice).toBe(mockOpenAIToolRequest.tool_choice);
    });

    test('generation parameters round-trip', () => {
      const requestWithParams = {
        ...mockOpenAIRequest,
        temperature: 0.7,
        max_tokens: 150,
        top_p: 0.9,
        stop: ['END', 'STOP']
      };
      
      const canonical = openaiAdapter.clientToCanonical(requestWithParams);
      const providerRequest = openaiAdapter.canonicalToProvider(canonical);
      
      expect(providerRequest.temperature).toBe(0.7);
      expect(providerRequest.max_tokens).toBe(150);
      expect(providerRequest.top_p).toBe(0.9);
      expect(providerRequest.stop).toEqual(['END', 'STOP']);
    });
  });

  describe('Anthropic Round-Trip', () => {
    test('basic request round-trip preserves structure', () => {
      const canonical1 = anthropicAdapter.clientToCanonical(mockAnthropicRequest);
      const providerRequest = anthropicAdapter.canonicalToProvider(canonical1);
      
      const canonical2 = anthropicAdapter.providerToCanonical(mockAnthropicResponse);
      const clientResponse = anthropicAdapter.canonicalToClient(canonical2);
      
      // Key fields should be preserved
      expect(clientResponse.model).toBe(mockAnthropicResponse.model);
      expect(clientResponse.id).toBe(mockAnthropicResponse.id);
      expect(clientResponse.type).toBe('message');
      expect(clientResponse.role).toBe('assistant');
      expect(Array.isArray(clientResponse.content)).toBe(true);
    });

    test('system message round-trip', () => {
      const requestWithSystem = {
        ...mockAnthropicRequest,
        system: 'You are a helpful assistant that always responds politely.'
      };
      
      const canonical = anthropicAdapter.clientToCanonical(requestWithSystem);
      const providerRequest = anthropicAdapter.canonicalToProvider(canonical);
      
      expect(providerRequest.system).toBe(requestWithSystem.system);
    });

    test('tool request round-trip preserves tool definitions', () => {
      const canonical = anthropicAdapter.clientToCanonical(mockAnthropicToolRequest);
      const providerRequest = anthropicAdapter.canonicalToProvider(canonical);
      
      expect(providerRequest.tools).toBeDefined();
      expect(providerRequest.tools!.length).toBe(mockAnthropicToolRequest.tools!.length);
      expect(providerRequest.tools![0].name).toBe(mockAnthropicToolRequest.tools![0].name);
    });

    test('max_tokens requirement preserved', () => {
      const canonical = anthropicAdapter.clientToCanonical(mockAnthropicRequest);
      const providerRequest = anthropicAdapter.canonicalToProvider(canonical);
      
      expect(providerRequest.max_tokens).toBe(mockAnthropicRequest.max_tokens);
      expect(typeof providerRequest.max_tokens).toBe('number');
      expect(providerRequest.max_tokens).toBeGreaterThan(0);
    });
  });

  describe('Cross-Adapter Canonical Consistency', () => {
    test('both adapters produce valid canonical requests', () => {
      const openaiCanonical = openaiAdapter.clientToCanonical(mockOpenAIRequest);
      const anthropicCanonical = anthropicAdapter.clientToCanonical(mockAnthropicRequest);
      
      // Both should have required canonical fields
      expect(openaiCanonical.schema_version).toBeDefined();
      expect(anthropicCanonical.schema_version).toBeDefined();
      
      expect(openaiCanonical.model).toBeDefined();
      expect(anthropicCanonical.model).toBeDefined();
      
      expect(Array.isArray(openaiCanonical.messages)).toBe(true);
      expect(Array.isArray(anthropicCanonical.messages)).toBe(true);
      
      // Message structure should be consistent
      expect(openaiCanonical.messages[0].role).toBeDefined();
      expect(anthropicCanonical.messages[0].role).toBeDefined();
      
      expect(Array.isArray(openaiCanonical.messages[0].content)).toBe(true);
      expect(Array.isArray(anthropicCanonical.messages[0].content)).toBe(true);
    });

    test('both adapters produce valid canonical responses', () => {
      const openaiCanonical = openaiAdapter.providerToCanonical(mockOpenAIResponse);
      const anthropicCanonical = anthropicAdapter.providerToCanonical(mockAnthropicResponse);
      
      // Both should have required canonical response fields
      expect(openaiCanonical.id).toBeDefined();
      expect(anthropicCanonical.id).toBeDefined();
      
      expect(openaiCanonical.choices).toBeDefined();
      expect(anthropicCanonical.choices).toBeDefined();
      
      expect(openaiCanonical.usage).toBeDefined();
      expect(anthropicCanonical.usage).toBeDefined();
      
      // Choice structure should be consistent
      expect(openaiCanonical.choices[0].message.role).toBe('assistant');
      expect(anthropicCanonical.choices[0].message.role).toBe('assistant');
      
      expect(Array.isArray(openaiCanonical.choices[0].message.content)).toBe(true);
      expect(Array.isArray(anthropicCanonical.choices[0].message.content)).toBe(true);
    });
  });

  describe('Data Type Consistency', () => {
    test('numeric fields maintain correct types', () => {
      const openaiCanonical = openaiAdapter.providerToCanonical(mockOpenAIResponse);
      const anthropicCanonical = anthropicAdapter.providerToCanonical(mockAnthropicResponse);
      
      // Usage fields should be numbers
      expect(typeof openaiCanonical.usage!.prompt_tokens).toBe('number');
      expect(typeof openaiCanonical.usage!.completion_tokens).toBe('number');
      expect(typeof openaiCanonical.usage!.total_tokens).toBe('number');
      
      expect(typeof anthropicCanonical.usage!.input_tokens).toBe('number');
      expect(typeof anthropicCanonical.usage!.output_tokens).toBe('number');
      
      // Timestamps should be numbers
      expect(typeof openaiCanonical.created).toBe('number');
      expect(typeof anthropicCanonical.created).toBe('number');
    });

    test('string fields maintain correct types', () => {
      const openaiCanonical = openaiAdapter.clientToCanonical(mockOpenAIRequest);
      const anthropicCanonical = anthropicAdapter.clientToCanonical(mockAnthropicRequest);
      
      expect(typeof openaiCanonical.model).toBe('string');
      expect(typeof anthropicCanonical.model).toBe('string');
      
      expect(typeof openaiCanonical.messages[0].role).toBe('string');
      expect(typeof anthropicCanonical.messages[0].role).toBe('string');
    });
  });
});