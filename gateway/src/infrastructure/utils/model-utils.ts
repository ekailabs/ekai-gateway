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
      .replace(/-\d+k$/, '')           // Remove context: -32k
  }

  /**
   * Check if a model requires max_completion_tokens instead of max_tokens
   * OpenAI o1/o3/o4 series and GPT-5 series models require max_completion_tokens parameter
   * Examples:
   * - o1 → true
   * - o1-mini → true
   * - o1-pro → true
   * - o3-mini → true
   * - gpt-5 → true
   * - gpt-5-mini → true
   * - openai/gpt-5 → true
   * - gpt-4o → false
   */
  static requiresMaxCompletionTokens(modelName: string): boolean {
    const normalizedName = this.removeProviderPrefix(modelName.toLowerCase());
    
    // OpenAI o1, o3, o4 series models and GPT-5 series models
    return /^o[1-4](-|$)/.test(normalizedName) || /^gpt-5(-|$)/.test(normalizedName);
  }

}
