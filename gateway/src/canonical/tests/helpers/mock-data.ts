/**
 * Mock data for testing adapters
 */

import { OpenAIRequest, OpenAIResponse } from '../../adapters/openai/index.js';
import { AnthropicRequest, AnthropicResponse } from '../../adapters/anthropic/index.js';

/**
 * OpenAI Mock Data
 */
export const mockOpenAIRequest: OpenAIRequest = {
  model: 'gpt-4',
  messages: [
    {
      role: 'user',
      content: 'What is the weather like today?'
    }
  ],
  max_tokens: 100,
  temperature: 0.7,
  stream: false
};

export const mockOpenAIResponse: OpenAIResponse = {
  id: 'chatcmpl-123',
  object: 'chat.completion',
  created: 1677652288,
  model: 'gpt-4',
  system_fingerprint: 'fp_44709d6fcb',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'I don\'t have access to real-time weather data. Please check a weather service for current conditions.'
      },
      finish_reason: 'stop',
      logprobs: null
    }
  ],
  usage: {
    prompt_tokens: 9,
    completion_tokens: 20,
    total_tokens: 29
  }
};

export const mockOpenAIToolRequest: OpenAIRequest = {
  model: 'gpt-4',
  messages: [
    {
      role: 'user',
      content: 'What\'s the weather in San Francisco?'
    }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_current_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
          },
          required: ['location']
        }
      }
    }
  ],
  tool_choice: 'auto'
};

/**
 * Anthropic Mock Data
 */
export const mockAnthropicRequest: AnthropicRequest = {
  model: 'claude-3-sonnet-20240229',
  max_tokens: 100,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What is the weather like today?'
        }
      ]
    }
  ]
};

export const mockAnthropicResponse: AnthropicResponse = {
  id: 'msg_01EuQv4ZF3K7YyBHBkYN4P5z',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: 'I don\'t have access to real-time weather data. Please check a weather service for current conditions.'
    }
  ],
  model: 'claude-3-sonnet-20240229',
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 12,
    output_tokens: 20
  }
};

export const mockAnthropicToolRequest: AnthropicRequest = {
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  tools: [
    {
      name: 'get_weather',
      description: 'Get the current weather in a given location',
      input_schema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA'
          }
        },
        required: ['location']
      }
    }
  ],
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What\'s the weather like in San Francisco?'
        }
      ]
    }
  ]
};

export const mockAnthropicToolResponse: AnthropicResponse = {
  id: 'msg_01A2B3C4D5E6F7G8H9I0J1K2',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: 'I\'ll check the weather in San Francisco for you.'
    },
    {
      type: 'tool_use',
      id: 'toolu_01A2B3C4D5E6F7G8H9I0J1K2',
      name: 'get_weather',
      input: {
        location: 'San Francisco, CA'
      }
    }
  ],
  model: 'claude-3-sonnet-20240229',
  stop_reason: 'tool_use',
  usage: {
    input_tokens: 15,
    output_tokens: 25
  }
};

/**
 * Streaming mock data
 */
export const mockOpenAIStreamChunks = [
  {
    id: 'chatcmpl-123',
    object: 'chat.completion.chunk',
    created: 1677652288,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-123',
    object: 'chat.completion.chunk',
    created: 1677652288,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        delta: { content: 'Hello' },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-123',
    object: 'chat.completion.chunk',
    created: 1677652288,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        delta: { content: ' there!' },
        finish_reason: 'stop'
      }
    ]
  }
];