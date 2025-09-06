/**
 * Model name utilities for handling different model naming conventions
 */
export class ModelUtils {
  /**
   * Remove provider prefix from model names
   * Examples:
   * - anthropic/claude-3-5-sonnet → claude-3-5-sonnet
   * - openai/gpt-4o → gpt-4o
   * - claude-sonnet-4 → claude-sonnet-4 (unchanged)
   */
  static removeProviderPrefix(modelName: string): string {
    return modelName.replace(/^[^/]+\//, '');
  }

  /**
   * Normalize model names for global cost optimization
   * Examples:
   * - anthropic/claude-3-5-sonnet → claude-3-5-sonnet
   * - claude-sonnet-4-20250514 → claude-sonnet-4
   * - gpt-4o-2024-08-06 → gpt-4o
   * - openai/gpt-4o-latest → gpt-4o
   * - gpt-4-32k → gpt-4
   */
  static normalizeModelName(modelName: string): string {
    return this.removeProviderPrefix(modelName)
      .replace(/-\d{8}$/, '')          // Remove Anthropic dates: -20250514
      .replace(/-\d{4}-\d{2}-\d{2}$/, '') // Remove OpenAI dates: -2024-08-06
      .replace(/-(latest|preview|beta|alpha)$/, '') // Remove versions
      .replace(/-\d+k$/, '');          // Remove context: -32k
  }

  /**
   * Ensure Anthropic models have required suffixes
   * Anthropic API requires model names to have version suffixes
   * Examples:
   * - claude-3-5-sonnet → claude-3-5-sonnet-20241022
   * - claude-sonnet-4 → claude-sonnet-4-20250514
   * - claude-3-5-sonnet-latest → claude-3-5-sonnet-latest (unchanged)
   */
  static ensureAnthropicSuffix(modelName: string): string {
    // Already has a date suffix or version suffix
    if (/-\d{8}$/.test(modelName) || /-(latest|preview|beta|alpha)$/.test(modelName)) {
      return modelName;
    }
    
    // Add default suffixes for known models
    if (modelName.includes('claude-3-5-sonnet')) {
      return modelName + '-20241022';
    }
    if (modelName.includes('claude-sonnet-4')) {
      return modelName + '-20250514';
    }
    
    // Fallback: add -latest for unknown models
    return modelName + '-latest';
  }

}