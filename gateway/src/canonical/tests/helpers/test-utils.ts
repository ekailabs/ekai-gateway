/**
 * Test utilities for canonical module testing
 */

import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../types/index.js';

/**
 * Deep comparison utility for objects (ignoring order and undefined values)
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  
  if (obj1 == null || obj2 == null) return obj1 === obj2;
  
  if (typeof obj1 !== typeof obj2) return false;
  
  if (typeof obj1 !== 'object') return obj1 === obj2;
  
  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
  
  if (Array.isArray(obj1)) {
    if (obj1.length !== obj2.length) return false;
    return obj1.every((item, index) => deepEqual(item, obj2[index]));
  }
  
  const keys1 = Object.keys(obj1).filter(k => obj1[k] !== undefined);
  const keys2 = Object.keys(obj2).filter(k => obj2[k] !== undefined);
  
  if (keys1.length !== keys2.length) return false;
  
  return keys1.every(key => keys2.includes(key) && deepEqual(obj1[key], obj2[key]));
}

/**
 * Assert that two objects are deeply equal
 */
export function assertDeepEqual(actual: any, expected: any, message?: string): void {
  if (!deepEqual(actual, expected)) {
    const prefix = message ? `${message}: ` : '';
    throw new Error(`${prefix}Objects are not deeply equal.\nActual: ${JSON.stringify(actual, null, 2)}\nExpected: ${JSON.stringify(expected, null, 2)}`);
  }
}

/**
 * Validate canonical request structure (basic checks)
 */
export function isValidCanonicalRequest(req: any): req is CanonicalRequest {
  return (
    req &&
    typeof req === 'object' &&
    typeof req.model === 'string' &&
    Array.isArray(req.messages) &&
    req.messages.length > 0 &&
    req.messages.every((msg: any) => 
      msg && 
      typeof msg.role === 'string' && 
      Array.isArray(msg.content)
    )
  );
}

/**
 * Validate canonical response structure (basic checks)
 */
export function isValidCanonicalResponse(res: any): res is CanonicalResponse {
  return (
    res &&
    typeof res === 'object' &&
    typeof res.id === 'string' &&
    typeof res.model === 'string' &&
    typeof res.created === 'number' &&
    Array.isArray(res.choices) &&
    res.choices.length > 0 &&
    res.choices.every((choice: any) =>
      choice &&
      typeof choice.index === 'number' &&
      choice.message &&
      typeof choice.message.role === 'string' &&
      Array.isArray(choice.message.content)
    )
  );
}

/**
 * Create a minimal valid canonical request for testing
 */
export function createMinimalCanonicalRequest(overrides?: Partial<CanonicalRequest>): CanonicalRequest {
  return {
    schema_version: '1.0.1',
    model: 'test-model',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Hello, world!'
          }
        ]
      }
    ],
    ...overrides
  } as CanonicalRequest;
}

/**
 * Create a minimal valid canonical response for testing
 */
export function createMinimalCanonicalResponse(overrides?: Partial<CanonicalResponse>): CanonicalResponse {
  return {
    schema_version: '1.0.1',
    id: 'test-response-id',
    model: 'test-model',
    created: Math.floor(Date.now() / 1000),
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Hello! How can I help you?'
            }
          ]
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 8,
      total_tokens: 18,
      input_tokens: 10,
      output_tokens: 8
    },
    ...overrides
  } as CanonicalResponse;
}

/**
 * Strip undefined values from an object (for comparison)
 */
export function stripUndefined(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = stripUndefined(value);
    }
  }
  return result;
}