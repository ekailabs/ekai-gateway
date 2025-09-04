import { logger } from './logger.js';

type ClientType = 'openai' | 'anthropic';

export class PassthroughValidator {
  
  /**
   * Validates passthrough scenarios by comparing client request to provider request
   */
  validatePassthrough(
    clientRequest: unknown,
    providerRequest: unknown,
    clientType: ClientType
  ): void {
    if (!clientRequest || !providerRequest) {
      logger.warn('❌ PASSTHROUGH VALIDATION FAILED', {
        clientType,
        model: 'unknown',
        totalIssues: 1,
        missingFields: ['Missing request data']
      });
      return;
    }

    const differences: string[] = [];
    this.deepCompare(clientRequest, providerRequest, '', differences);
    
    const model = this.getModelName(clientRequest);
    
    if (differences.length > 0) {
      logger.warn('❌ PASSTHROUGH VALIDATION FAILED', {
        clientType,
        model,
        totalIssues: differences.length,
        missingFields: differences
      });
    } else {
      logger.info('✅ PASSTHROUGH VALIDATION PASSED', {
        clientType,
        model,
        messageCount: this.getMessageCount(clientRequest)
      });
    }
  }

  /**
   * Recursively compare all fields from client to provider
   */
  private deepCompare(clientObj: unknown, providerObj: unknown, path: string, differences: string[]): void {
    if (clientObj == null) return;

    const currentPath = path || 'root';

    // Arrays
    if (Array.isArray(clientObj)) {
      if (!Array.isArray(providerObj)) {
        differences.push(`${currentPath}: type mismatch (client: array, provider: ${this.getType(providerObj)})`);
        return;
      }
      
      this.compareArrays(clientObj, providerObj, currentPath, differences);
      return;
    }

    // Objects  
    if (this.isObject(clientObj)) {
      if (!this.isObject(providerObj)) {
        differences.push(`${currentPath}: type mismatch (client: object, provider: ${this.getType(providerObj)})`);
        return;
      }
      
      this.compareObjects(clientObj, providerObj, currentPath, differences);
      return;
    }

    // Primitives
    if (clientObj !== providerObj) {
      differences.push(`${currentPath}: value differs (client: ${clientObj}, provider: ${providerObj})`);
    }
  }

  private compareArrays(clientArr: unknown[], providerArr: unknown[], path: string, differences: string[]): void {
    if (clientArr.length !== providerArr.length) {
      differences.push(`${path}: length differs (${clientArr.length} vs ${providerArr.length})`);
    }

    clientArr.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (index >= providerArr.length) {
        differences.push(`${itemPath}: missing in provider`);
      } else {
        this.deepCompare(item, providerArr[index], itemPath, differences);
      }
    });
  }

  private compareObjects(clientObj: Record<string, unknown>, providerObj: Record<string, unknown>, path: string, differences: string[]): void {
    Object.entries(clientObj).forEach(([key, value]) => {
      const keyPath = path === 'root' ? key : `${path}.${key}`;
      
      if (!(key in providerObj)) {
        differences.push(`${keyPath}: missing in provider`);
      } else {
        this.deepCompare(value, providerObj[key], keyPath, differences);
      }
    });
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private getType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private getModelName(request: unknown): string {
    return this.isObject(request) && typeof request.model === 'string' 
      ? request.model 
      : 'unknown';
  }

  private getMessageCount(request: unknown): number {
    return this.isObject(request) && Array.isArray(request.messages) 
      ? request.messages.length 
      : 0;
  }

  /**
   * Determines if this request should be validated as a passthrough
   */
  shouldValidatePassthrough(clientType: ClientType, model: string): boolean {
    const lowerModel = model.toLowerCase();
    
    return clientType === 'anthropic' 
      ? lowerModel.includes('claude')
      : lowerModel.includes('gpt') || lowerModel.includes('o1') || !model.includes('/');
  }
}

export const passthroughValidator = new PassthroughValidator();