import { Request as CanonicalRequest } from '../../types/index.js';

/**
 * OpenAI tool format interfaces
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
    strict?: boolean;
  };
}

export interface OpenAIFunction {
  name: string;
  description?: string;
  parameters?: any;
}

/**
 * Convert canonical tools to OpenAI tools format
 * @param tools - Canonical tools array
 */
export function toOpenAITools(tools: CanonicalRequest['tools']): OpenAITool[] {
  if (!tools) return [];
  
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      strict: tool.function.strict
    }
  }));
}

/**
 * Convert canonical functions to OpenAI functions format (legacy)
 * @param functions - Canonical functions array  
 */
export function toOpenAIFunctions(functions: CanonicalRequest['functions']): OpenAIFunction[] {
  if (!functions) return [];
  
  return functions.map(fn => ({
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters
  }));
}

/**
 * Convert canonical tool_choice to OpenAI tool_choice format
 * @param toolChoice - Canonical tool choice
 */
export function toOpenAIToolChoice(toolChoice: CanonicalRequest['tool_choice']): any {
  if (!toolChoice) return undefined;
  
  if (typeof toolChoice === 'string') {
    // Handle canonical -> OpenAI string mappings
    switch (toolChoice) {
      case 'required': return 'auto'; // OpenAI doesn't have 'required', use 'auto'
      case 'any': return 'auto';      // OpenAI doesn't have 'any', use 'auto'
      case 'auto': return 'auto';
      case 'none': return 'none';
      default: return toolChoice;
    }
  }
  
  if (typeof toolChoice === 'object') {
    if (toolChoice.type === 'function') {
      return {
        type: 'function',
        function: {
          name: toolChoice.function.name
        }
      };
    }
    
    if (toolChoice.type === 'tool') {
      // Convert tool choice to function choice for OpenAI compatibility
      return {
        type: 'function',
        function: {
          name: toolChoice.name
        }
      };
    }
  }
  
  return toolChoice;
}

/**
 * Convert canonical function_call to OpenAI function_call format (legacy)
 * @param functionCall - Canonical function call
 */
export function toOpenAIFunctionCall(functionCall: CanonicalRequest['function_call']): any {
  if (!functionCall) return undefined;
  
  if (typeof functionCall === 'string') {
    return functionCall; // 'auto', 'none'
  }
  
  if (typeof functionCall === 'object') {
    return {
      name: functionCall.name
    };
  }
  
  return functionCall;
}

/**
 * Convert OpenAI tools back to canonical format
 * @param tools - OpenAI tools array
 */
export function fromOpenAITools(tools: OpenAITool[]): any[] {
  if (!tools) return [];
  
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      strict: tool.function.strict
    }
  }));
}

/**
 * Convert OpenAI functions back to canonical format (legacy)
 * @param functions - OpenAI functions array
 */
export function fromOpenAIFunctions(functions: OpenAIFunction[]): any[] {
  if (!functions) return [];
  
  return functions.map(fn => ({
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters
  }));
}

/**
 * Convert OpenAI tool_choice back to canonical format
 * @param toolChoice - OpenAI tool choice
 */
export function fromOpenAIToolChoice(toolChoice: any): any {
  if (!toolChoice) return undefined;
  
  if (typeof toolChoice === 'string') {
    return toolChoice; // Keep 'auto', 'none' as-is
  }
  
  if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
    return {
      type: 'function',
      function: {
        name: toolChoice.function.name
      }
    };
  }
  
  return toolChoice;
}

/**
 * Convert OpenAI function_call back to canonical format (legacy)
 * @param functionCall - OpenAI function call
 */
export function fromOpenAIFunctionCall(functionCall: any): any {
  if (!functionCall) return undefined;
  
  if (typeof functionCall === 'string') {
    return functionCall;
  }
  
  if (typeof functionCall === 'object') {
    return {
      name: functionCall.name
    };
  }
  
  return functionCall;
}

/**
 * Convert OpenAI tool calls in response to canonical format
 * @param toolCalls - OpenAI tool calls from response
 */
export function fromOpenAIResponseToolCalls(toolCalls: any[]): any[] {
  if (!toolCalls) return [];
  
  return toolCalls.map(tc => ({
    id: tc.id,
    type: 'function',
    function: {
      name: tc.function.name,
      arguments: tc.function.arguments
    }
  }));
}

/**
 * Helper to determine if request uses tools or functions (legacy)
 * @param canonical - Canonical request
 */
export function getToolingType(canonical: CanonicalRequest): 'tools' | 'functions' | 'none' {
  if (canonical.tools && canonical.tools.length > 0) return 'tools';
  if (canonical.functions && canonical.functions.length > 0) return 'functions';
  return 'none';
}

/**
 * Usage examples:
 * 
 * // Convert tools to OpenAI format
 * const openaiTools = toOpenAITools(canonical.tools);
 * const openaiToolChoice = toOpenAIToolChoice(canonical.tool_choice);
 * 
 * // Convert back from OpenAI format
 * const canonicalTools = fromOpenAITools(openaiResponse.tools);
 * 
 * // Handle both tools and functions (legacy)
 * const toolingType = getToolingType(canonical);
 * if (toolingType === 'tools') {
 *   openaiReq.tools = toOpenAITools(canonical.tools);
 *   openaiReq.tool_choice = toOpenAIToolChoice(canonical.tool_choice);
 * } else if (toolingType === 'functions') {
 *   openaiReq.functions = toOpenAIFunctions(canonical.functions);
 *   openaiReq.function_call = toOpenAIFunctionCall(canonical.function_call);
 * }
 */