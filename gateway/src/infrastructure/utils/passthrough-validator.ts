import { logger } from './logger.js';

/**
 * Passthrough validation utilities
 */
class PassthroughValidator {
  /**
   * Determine if we should validate passthrough scenario
   */
  shouldValidatePassthrough(clientType: 'openai' | 'anthropic', model: string): boolean {
    const provider = this.getProviderForModel(model);
    
    // OpenAI client → OpenAI provider = passthrough
    if (clientType === 'openai' && provider === 'openai') {
      return true;
    }
    
    // Anthropic client → Anthropic provider = passthrough  
    if (clientType === 'anthropic' && provider === 'anthropic') {
      return true;
    }
    
    return false;
  }

  /**
   * Validate response passthrough integrity
   */
  validateResponsePassthrough(
    canonicalResponse: any,
    clientResponse: any,
    clientType: 'openai' | 'anthropic'
  ): void {
    if (!canonicalResponse._isPassthrough) {
      return;
    }

    logger.debug('🔍 Validating passthrough response', {
      clientType,
      hasCanonicalId: !!canonicalResponse.id,
      hasClientId: !!clientResponse.id
    });

    // Basic validation that key fields are preserved
    if (canonicalResponse.id && clientResponse.id && canonicalResponse.id !== clientResponse.id) {
      logger.warn('Passthrough validation: ID mismatch', {
        canonical: canonicalResponse.id,
        client: clientResponse.id
      });
    }

    if (canonicalResponse.model && clientResponse.model && canonicalResponse.model !== clientResponse.model) {
      logger.warn('Passthrough validation: Model mismatch', {
        canonical: canonicalResponse.model,
        client: clientResponse.model
      });
    }
  }

  private getProviderForModel(model: string): string {
    if (model.startsWith('claude-')) return 'anthropic';
    if (!model.includes('/')) return 'openai';
    return 'openrouter';
  }
}

export const passthroughValidator = new PassthroughValidator();