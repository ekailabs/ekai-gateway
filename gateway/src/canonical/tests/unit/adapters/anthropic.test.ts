/**
 * Anthropic Adapter Tests  
 */

import { describe, test, expect } from 'vitest';
import { anthropicAdapter } from '../../../adapters/anthropic/index.js';
import { mockAnthropicRequest, mockAnthropicResponse, mockAnthropicToolRequest, mockAnthropicToolResponse } from '../../helpers/mock-data.js';
import { isValidCanonicalRequest, isValidCanonicalResponse } from '../../helpers/test-utils.js';
import canonicalValidator from '../../../validation/canonical-validator.js';

describe('Anthropic Adapter', () => {
  describe('clientToCanonical', () => {
    test('transforms basic request correctly', () => {
      const canonical = anthropicAdapter.clientToCanonical(mockAnthropicRequest);
      
      // Validate structure
      expect(isValidCanonicalRequest(canonical)).toBe(true);
      
      // Validate against schema
      const validation = canonicalValidator.validateRequest(canonical);
      expect(validation.valid).toBe(true);
      
      // Check specific transformations
      expect(canonical.model).toBe(mockAnthropicRequest.model);
      expect(canonical.messages).toBeDefined();
      expect(canonical.messages.length).toBe(1);
      expect(canonical.messages[0].role).toBe('user');
      expect(canonical.messages[0].content[0].type).toBe('text');
    });

    test('handles system message correctly', () => {
      const requestWithSystem = {
        ...mockAnthropicRequest,
        system: 'You are a helpful assistant.'
      };
      
      const canonical = anthropicAdapter.clientToCanonical(requestWithSystem);
      
      expect(canonical.system).toBe('You are a helpful assistant.');
    });

    test('handles tool requests correctly', () => {
      const canonical = anthropicAdapter.clientToCanonical(mockAnthropicToolRequest);
      
      expect(canonical.tools).toBeDefined();
      expect(canonical.tools!.length).toBe(1);
      expect(canonical.tools![0].type).toBe('function');
      expect(canonical.tools![0].function.name).toBe('get_weather');
    });

    test('handles max_tokens requirement', () => {
      const canonical = anthropicAdapter.clientToCanonical(mockAnthropicRequest);
      
      expect(canonical.generation?.max_tokens).toBe(mockAnthropicRequest.max_tokens);
    });

    test('handles generation parameters', () => {
      const requestWithParams = {
        ...mockAnthropicRequest,
        temperature: 0.8,
        top_p: 0.9,
        top_k: 40,
        stop_sequences: ['END']
      };
      
      const canonical = anthropicAdapter.clientToCanonical(requestWithParams);
      
      expect(canonical.generation?.temperature).toBe(0.8);
      expect(canonical.generation?.top_p).toBe(0.9);
      expect(canonical.generation?.top_k).toBe(40);
      expect(canonical.generation?.stop_sequences).toEqual(['END']);
    });
  });

  describe('canonicalToProvider', () => {
    test('transforms canonical request to Anthropic format', () => {
      const canonical = anthropicAdapter.clientToCanonical(mockAnthropicRequest);
      const providerRequest = anthropicAdapter.canonicalToProvider(canonical);
      
      // Should maintain Anthropic structure
      expect(providerRequest.model).toBe(mockAnthropicRequest.model);
      expect(providerRequest.max_tokens).toBe(mockAnthropicRequest.max_tokens);
      expect(providerRequest.messages).toBeDefined();
    });

    test('ensures max_tokens is set', () => {
      const canonical = anthropicAdapter.clientToCanonical({
        ...mockAnthropicRequest,
        max_tokens: 256
      });
      
      const providerRequest = anthropicAdapter.canonicalToProvider(canonical);
      
      expect(providerRequest.max_tokens).toBe(256);
    });

    test('handles system message', () => {
      const canonical = anthropicAdapter.clientToCanonical({
        ...mockAnthropicRequest,
        system: 'You are helpful.'
      });
      
      const providerRequest = anthropicAdapter.canonicalToProvider(canonical);
      
      expect(providerRequest.system).toBe('You are helpful.');
    });
  });

  describe('providerToCanonical', () => {
    test('transforms provider response correctly', () => {
      const canonical = anthropicAdapter.providerToCanonical(mockAnthropicResponse);
      
      // Validate structure  
      expect(isValidCanonicalResponse(canonical)).toBe(true);
      
      // Validate against schema
      const validation = canonicalValidator.validateResponse(canonical);
      if (!validation.valid) {
        console.log('Anthropic Response validation errors:', validation.errors);
        console.log('Canonical response:', JSON.stringify(canonical, null, 2));
      }
      expect(validation.valid).toBe(true);
      
      // Check specific transformations
      expect(canonical.id).toBe(mockAnthropicResponse.id);
      expect(canonical.model).toBe(mockAnthropicResponse.model);
      expect(canonical.choices.length).toBe(1);
      expect(canonical.choices[0].message.role).toBe('assistant');
    });

    test('handles tool use responses', () => {
      const canonical = anthropicAdapter.providerToCanonical(mockAnthropicToolResponse);
      
      expect(canonical.choices[0].finish_reason).toBe('tool_calls');
      // Should extract tool calls from content
      expect(canonical.choices[0].tool_calls).toBeDefined();
      expect(canonical.choices[0].tool_calls!.length).toBe(1);
    });

    test('handles usage data correctly', () => {
      const canonical = anthropicAdapter.providerToCanonical(mockAnthropicResponse);
      
      expect(canonical.usage).toBeDefined();
      expect(canonical.usage!.input_tokens).toBe(mockAnthropicResponse.usage.input_tokens);
      expect(canonical.usage!.output_tokens).toBe(mockAnthropicResponse.usage.output_tokens);
      // Should also have OpenAI-compatible fields
      expect(canonical.usage!.prompt_tokens).toBe(mockAnthropicResponse.usage.input_tokens);
      expect(canonical.usage!.completion_tokens).toBe(mockAnthropicResponse.usage.output_tokens);
    });

    test('handles created timestamp', () => {
      const canonical = anthropicAdapter.providerToCanonical(mockAnthropicResponse);
      
      expect(canonical.created).toBeDefined();
      expect(typeof canonical.created).toBe('number');
      expect(canonical.created).toBeGreaterThan(0);
    });
  });

  describe('canonicalToClient', () => {
    test('transforms canonical response to client format', () => {
      const canonical = anthropicAdapter.providerToCanonical(mockAnthropicResponse);
      const clientResponse = anthropicAdapter.canonicalToClient(canonical);
      
      // Should match Anthropic response format
      expect(clientResponse.id).toBe(mockAnthropicResponse.id);
      expect(clientResponse.type).toBe('message');
      expect(clientResponse.role).toBe('assistant');
      expect(Array.isArray(clientResponse.content)).toBe(true);
      expect(clientResponse.model).toBe(mockAnthropicResponse.model);
    });

    test('handles empty choices gracefully', () => {
      const emptyCanonical = {
        schema_version: '1.0.1',
        id: 'test-id',
        model: 'test-model', 
        created: Date.now(),
        choices: [{
          index: 0,
          message: {
            role: 'assistant' as const,
            content: []
          },
          finish_reason: 'stop'
        }],
        usage: { input_tokens: 0, output_tokens: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
      
      const clientResponse = anthropicAdapter.canonicalToClient(emptyCanonical);
      
      expect(clientResponse.content).toEqual([]);
      expect(clientResponse.stop_reason).toBe('stop');
    });
  });

  describe('Format Type', () => {
    test('has correct format type', () => {
      expect(anthropicAdapter.formatType).toBe('anthropic');
    });
  });
});