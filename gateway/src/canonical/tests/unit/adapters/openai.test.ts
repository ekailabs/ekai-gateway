/**
 * OpenAI Adapter Tests
 */

import { describe, test, expect } from 'vitest';
import { openaiAdapter } from '../../../adapters/openai/index.js';
import { mockOpenAIRequest, mockOpenAIResponse, mockOpenAIToolRequest } from '../../helpers/mock-data.js';
import { isValidCanonicalRequest, isValidCanonicalResponse, assertDeepEqual } from '../../helpers/test-utils.js';
import canonicalValidator from '../../../validation/canonical-validator.js';

describe('OpenAI Adapter', () => {
  describe('clientToCanonical', () => {
    test('transforms basic request correctly', () => {
      const canonical = openaiAdapter.clientToCanonical(mockOpenAIRequest);
      
      // Validate structure
      expect(isValidCanonicalRequest(canonical)).toBe(true);
      
      // Validate against schema
      const validation = canonicalValidator.validateRequest(canonical);
      expect(validation.valid).toBe(true);
      
      // Check specific transformations
      expect(canonical.model).toBe(mockOpenAIRequest.model);
      expect(canonical.messages).toBeDefined();
      expect(canonical.messages.length).toBe(1);
      expect(canonical.messages[0].role).toBe('user');
      expect(canonical.messages[0].content[0].type).toBe('text');
      expect(canonical.messages[0].content[0].text).toBe('What is the weather like today?');
    });

    test('handles system messages correctly', () => {
      const requestWithSystem = {
        ...mockOpenAIRequest,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello!' }
        ]
      };
      
      const canonical = openaiAdapter.clientToCanonical(requestWithSystem);
      
      expect(canonical.system).toBe('You are a helpful assistant.');
      expect(canonical.messages.length).toBe(1); // System message should be extracted
      expect(canonical.messages[0].role).toBe('user');
    });

    test('handles tool requests correctly', () => {
      const canonical = openaiAdapter.clientToCanonical(mockOpenAIToolRequest);
      
      expect(canonical.tools).toBeDefined();
      expect(canonical.tools!.length).toBe(1);
      expect(canonical.tools![0].type).toBe('function');
      expect(canonical.tools![0].function.name).toBe('get_current_weather');
      expect(canonical.tool_choice).toBe('auto');
    });

    test('handles generation parameters', () => {
      const requestWithParams = {
        ...mockOpenAIRequest,
        temperature: 0.8,
        max_tokens: 150,
        stop: ['END', 'STOP']
      };
      
      const canonical = openaiAdapter.clientToCanonical(requestWithParams);
      
      expect(canonical.generation?.temperature).toBe(0.8);
      expect(canonical.generation?.max_tokens).toBe(150);
      expect(canonical.generation?.stop).toEqual(['END', 'STOP']);
    });
  });

  describe('canonicalToProvider', () => {
    test('transforms canonical request to OpenAI format', () => {
      // First convert to canonical, then back to provider format
      const canonical = openaiAdapter.clientToCanonical(mockOpenAIRequest);
      const providerRequest = openaiAdapter.canonicalToProvider(canonical);
      
      // Should be similar to original (allowing for transformations)
      expect(providerRequest.model).toBe(mockOpenAIRequest.model);
      expect(providerRequest.messages).toBeDefined();
      expect(providerRequest.messages.length).toBe(mockOpenAIRequest.messages.length);
    });

    test('handles system message correctly', () => {
      const canonical = openaiAdapter.clientToCanonical({
        ...mockOpenAIRequest,
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello!' }
        ]
      });
      
      const providerRequest = openaiAdapter.canonicalToProvider(canonical);
      
      // System should be merged into messages array
      expect(providerRequest.messages.length).toBeGreaterThanOrEqual(1);
      expect(providerRequest.messages.some((msg: any) => msg.role === 'system')).toBe(true);
    });
  });

  describe('providerToCanonical', () => {
    test('transforms provider response correctly', () => {
      const canonical = openaiAdapter.providerToCanonical(mockOpenAIResponse);
      
      // Validate structure
      expect(isValidCanonicalResponse(canonical)).toBe(true);
      
      // Validate against schema
      const validation = canonicalValidator.validateResponse(canonical);
      if (!validation.valid) {
        console.log('OpenAI Response validation errors:', validation.errors);
        console.log('Canonical response:', JSON.stringify(canonical, null, 2));
      }
      expect(validation.valid).toBe(true);
      
      // Check specific transformations
      expect(canonical.id).toBe(mockOpenAIResponse.id);
      expect(canonical.model).toBe(mockOpenAIResponse.model);
      expect(canonical.choices.length).toBe(1);
      expect(canonical.choices[0].message.role).toBe('assistant');
      expect(canonical.choices[0].message.content[0].type).toBe('text');
    });

    test('handles usage data correctly', () => {
      const canonical = openaiAdapter.providerToCanonical(mockOpenAIResponse);
      
      expect(canonical.usage).toBeDefined();
      expect(canonical.usage!.prompt_tokens).toBe(mockOpenAIResponse.usage.prompt_tokens);
      expect(canonical.usage!.completion_tokens).toBe(mockOpenAIResponse.usage.completion_tokens);
      expect(canonical.usage!.total_tokens).toBe(mockOpenAIResponse.usage.total_tokens);
    });
  });

  describe('canonicalToClient', () => {
    test('transforms canonical response to client format', () => {
      // First convert provider response to canonical, then to client
      const canonical = openaiAdapter.providerToCanonical(mockOpenAIResponse);
      const clientResponse = openaiAdapter.canonicalToClient(canonical);
      
      // Should match OpenAI response format
      expect(clientResponse.id).toBe(mockOpenAIResponse.id);
      expect(clientResponse.object).toBe('chat.completion');
      expect(clientResponse.model).toBe(mockOpenAIResponse.model);
      expect(clientResponse.choices.length).toBe(1);
      expect(clientResponse.choices[0].message.role).toBe('assistant');
      expect(clientResponse.choices[0].message.content).toBe(mockOpenAIResponse.choices[0].message.content);
    });

    test('handles empty content gracefully', () => {
      const canonical = openaiAdapter.providerToCanonical({
        ...mockOpenAIResponse,
        choices: [
          {
            ...mockOpenAIResponse.choices[0],
            message: {
              ...mockOpenAIResponse.choices[0].message,
              content: null
            }
          }
        ]
      });
      
      const clientResponse = openaiAdapter.canonicalToClient(canonical);
      
      expect(clientResponse.choices[0].message.content).toBe(null);
    });
  });

  describe('Format Type', () => {
    test('has correct format type', () => {
      expect(openaiAdapter.formatType).toBe('openai');
    });
  });
});