/**
 * Schema validation tests
 */

import { describe, test, expect, beforeAll } from 'vitest';
import canonicalValidator from '../../../validation/canonical-validator.js';
import { createMinimalCanonicalRequest, createMinimalCanonicalResponse } from '../../helpers/test-utils.js';

describe('Schema Validator', () => {
  describe('Request Validation', () => {
    test('validates minimal valid request', () => {
      const request = createMinimalCanonicalRequest();
      const result = canonicalValidator.validateRequest(request);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    test('rejects request with missing model', () => {
      const request = createMinimalCanonicalRequest();
      delete (request as any).model;
      
      const result = canonicalValidator.validateRequest(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors?.some(err => err.includes("must have required property 'model'"))).toBe(true);
    });

    test('rejects request with missing messages', () => {
      const request = createMinimalCanonicalRequest();
      delete (request as any).messages;
      
      const result = canonicalValidator.validateRequest(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors?.some(error => error.includes('messages'))).toBe(true);
    });

    test('rejects request with empty messages array', () => {
      const request = createMinimalCanonicalRequest({
        messages: []
      });
      
      const result = canonicalValidator.validateRequest(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors?.some(error => error.includes('messages'))).toBe(true);
    });

    test('validates request with tool calling', () => {
      const request = createMinimalCanonicalRequest({
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_function',
              description: 'A test function',
              parameters: {
                type: 'object',
                properties: {
                  param1: { type: 'string' }
                },
                required: ['param1']
              }
            }
          }
        ],
        tool_choice: 'auto'
      });
      
      const result = canonicalValidator.validateRequest(request);
      
      expect(result.valid).toBe(true);
    });

    test('validates request with generation parameters', () => {
      const request = createMinimalCanonicalRequest({
        generation: {
          temperature: 0.7,
          max_tokens: 100,
          top_p: 0.9,
          stop: ['END']
        }
      });
      
      const result = canonicalValidator.validateRequest(request);
      
      expect(result.valid).toBe(true);
    });

    test('rejects null or undefined data', () => {
      const nullResult = canonicalValidator.validateRequest(null);
      const undefinedResult = canonicalValidator.validateRequest(undefined);
      
      expect(nullResult.valid).toBe(false);
      expect(nullResult.errors).toContain('Request data is null or undefined');
      
      expect(undefinedResult.valid).toBe(false);
      expect(undefinedResult.errors).toContain('Request data is null or undefined');
    });
  });

  describe('Response Validation', () => {
    test('validates minimal valid response', () => {
      const response = createMinimalCanonicalResponse();
      const result = canonicalValidator.validateResponse(response);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    test('rejects response with missing id', () => {
      const response = createMinimalCanonicalResponse();
      delete (response as any).id;
      
      const result = canonicalValidator.validateResponse(response);
      
      expect(result.valid).toBe(false);
      expect(result.errors?.some(error => error.includes('id'))).toBe(true);
    });

    test('rejects response with missing choices', () => {
      const response = createMinimalCanonicalResponse();
      delete (response as any).choices;
      
      const result = canonicalValidator.validateResponse(response);
      
      expect(result.valid).toBe(false);
      expect(result.errors?.some(error => error.includes('choices'))).toBe(true);
    });

    test('rejects response with empty choices array', () => {
      const response = createMinimalCanonicalResponse({
        choices: []
      });
      
      const result = canonicalValidator.validateResponse(response);
      
      expect(result.valid).toBe(false);
      expect(result.errors?.some(error => error.includes('choices'))).toBe(true);
    });

    test('validates response with usage data', () => {
      const response = createMinimalCanonicalResponse({
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          input_tokens: 10,
          output_tokens: 20
        }
      });
      
      const result = canonicalValidator.validateResponse(response);
      
      expect(result.valid).toBe(true);
    });

    test('rejects null or undefined data', () => {
      const nullResult = canonicalValidator.validateResponse(null);
      const undefinedResult = canonicalValidator.validateResponse(undefined);
      
      expect(nullResult.valid).toBe(false);
      expect(nullResult.errors).toContain('Response data is null or undefined');
      
      expect(undefinedResult.valid).toBe(false);
      expect(undefinedResult.errors).toContain('Response data is null or undefined');
    });
  });

  describe('Helper Methods', () => {
    test('createCanonicalRequest creates valid request', () => {
      const request = canonicalValidator.createCanonicalRequest({
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }]
          }
        ]
      });
      
      expect(request.schema_version).toBe('1.0.1');
      const result = canonicalValidator.validateRequest(request);
      expect(result.valid).toBe(true);
    });

    test('createCanonicalResponse creates valid response', () => {
      const response = canonicalValidator.createCanonicalResponse({
        id: 'test-id',
        model: 'test-model',
        created: 1234567890,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello' }]
            },
            finish_reason: 'stop'
          }
        ]
      });
      
      expect(response.schema_version).toBe('1.0.1');
      const result = canonicalValidator.validateResponse(response);
      expect(result.valid).toBe(true);
    });
  });
});