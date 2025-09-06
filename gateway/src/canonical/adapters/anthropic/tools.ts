import { Request as CanonicalRequest } from '../../types/index.js';

/**
 * Anthropic tool format interfaces
 */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: any;
}

/**
 * Convert canonical tools to Anthropic tools format
 * @param tools - Canonical tools array
 */
export function toAnthropicTools(tools: CanonicalRequest['tools']): AnthropicTool[] {
  if (!tools) return [];
  
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters || {}
  }));
}

/**
 * Convert canonical tool_choice to Anthropic tool_choice format
 * @param toolChoice - Canonical tool choice
 */
export function toAnthropicToolChoice(toolChoice: CanonicalRequest['tool_choice']): any {
  if (!toolChoice) return undefined;
  
  if (typeof toolChoice === 'string') {
    // Handle canonical -> Anthropic string mappings
    switch (toolChoice) {
      case 'auto': return 'auto';
      case 'required': return 'any';  // Anthropic uses 'any' for required
      case 'any': return 'any';
      case 'none': return undefined;  // Don't send tool_choice for 'none'
      default: return toolChoice;
    }
  }
  
  if (typeof toolChoice === 'object') {
    if (toolChoice.type === 'function' || toolChoice.type === 'tool') {
      const name = toolChoice.type === 'function' ? toolChoice.function?.name : toolChoice.name;
      return {
        type: 'tool',
        name: name
      };
    }
  }
  
  return toolChoice;
}

/**
 * Convert Anthropic tools back to canonical format
 * @param tools - Anthropic tools array
 */
export function fromAnthropicTools(tools: AnthropicTool[]): any[] {
  if (!tools) return [];
  
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  }));
}

/**
 * Convert Anthropic tool_choice back to canonical format
 * @param toolChoice - Anthropic tool choice
 */
export function fromAnthropicToolChoice(toolChoice: any): any {
  if (!toolChoice) return undefined;
  
  if (typeof toolChoice === 'string') {
    // Map Anthropic strings back to canonical
    switch (toolChoice) {
      case 'any': return 'required';  // Map 'any' back to 'required'
      case 'auto': return 'auto';
      default: return toolChoice;
    }
  }
  
  if (typeof toolChoice === 'object' && toolChoice.type === 'tool') {
    return {
      type: 'function',
      function: {
        name: toolChoice.name
      }
    };
  }
  
  return toolChoice;
}

/**
 * Extract tool use blocks from Anthropic content
 * @param content - Anthropic response content blocks
 */
export function extractAnthropicToolUse(content: any[]): Array<{
  id: string;
  name: string;
  input: any;
}> {
  return content
    .filter(block => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input
    }));
}

/**
 * Convert Anthropic tool use blocks to canonical tool calls format
 * @param toolUseBlocks - Anthropic tool_use content blocks
 */
export function anthropicToolUseToCanonical(toolUseBlocks: any[]): any[] {
  return toolUseBlocks.map(block => ({
    id: block.id,
    type: 'function',
    function: {
      name: block.name,
      arguments: JSON.stringify(block.input)
    }
  }));
}

/**
 * Convert canonical tool calls to Anthropic tool_use content blocks
 * @param toolCalls - Canonical tool calls
 */
export function canonicalToolCallsToAnthropic(toolCalls: any[]): any[] {
  return toolCalls.map(call => ({
    type: 'tool_use',
    id: call.id,
    name: call.function.name,
    input: JSON.parse(call.function.arguments)
  }));
}

/**
 * Check if canonical request has tools
 * @param canonical - Canonical request
 */
export function hasTools(canonical: CanonicalRequest): boolean {
  return Boolean(canonical.tools && canonical.tools.length > 0);
}

/**
 * Check if Anthropic content contains tool use
 * @param content - Anthropic content blocks
 */
export function hasToolUse(content: any[]): boolean {
  return content.some(block => block.type === 'tool_use');
}

/**
 * Validate tool choice is compatible with available tools
 * @param toolChoice - Tool choice value
 * @param tools - Available tools
 */
export function validateToolChoice(toolChoice: any, tools: AnthropicTool[]): boolean {
  if (!toolChoice) return true;
  
  if (typeof toolChoice === 'string') {
    return ['auto', 'any'].includes(toolChoice);
  }
  
  if (typeof toolChoice === 'object' && toolChoice.type === 'tool') {
    return tools.some(tool => tool.name === toolChoice.name);
  }
  
  return false;
}

/**
 * Usage examples:
 * 
 * // Convert tools to Anthropic format
 * const anthropicTools = toAnthropicTools(canonical.tools);
 * const anthropicToolChoice = toAnthropicToolChoice(canonical.tool_choice);
 * 
 * // Convert back from Anthropic format
 * const canonicalTools = fromAnthropicTools(anthropicResponse.tools);
 * 
 * // Extract tool use from response
 * const toolUse = extractAnthropicToolUse(anthropicResponse.content);
 * const canonicalToolCalls = anthropicToolUseToCanonical(toolUse);
 * 
 * // Check for tools
 * if (hasTools(canonical)) {
 *   anthropicReq.tools = toAnthropicTools(canonical.tools);
 *   anthropicReq.tool_choice = toAnthropicToolChoice(canonical.tool_choice);
 * }
 * 
 * // Validate tool choice
 * const isValid = validateToolChoice(anthropicReq.tool_choice, anthropicReq.tools);
 */