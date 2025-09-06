import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Request, Response, StreamingResponse } from '../types/index.js';

class CanonicalValidator {
  private ajv: Ajv;
  private requestValidator: ValidateFunction<Request> | null = null;
  private responseValidator: ValidateFunction<Response> | null = null;
  private streamingResponseValidator: ValidateFunction<StreamingResponse> | null = null;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      removeAdditional: false,
      useDefaults: true,
      coerceTypes: false,
      strict: false // Allow draft-07 schemas
    });
    
    // Add format validators (uri, date-time, etc.)
    addFormats(this.ajv);
    
    this.loadSchemas();
  }


  private loadSchemas() {
    const schemasDir = join(__dirname, '../schemas');
    
    try {
      // Load request schema
      const requestSchema = JSON.parse(
        readFileSync(join(schemasDir, 'request.schema.json'), 'utf8')
      );
      this.requestValidator = this.ajv.compile<Request>(requestSchema);

      // Load response schema
      const responseSchema = JSON.parse(
        readFileSync(join(schemasDir, 'response.schema.json'), 'utf8')
      );
      this.responseValidator = this.ajv.compile<Response>(responseSchema);

      // Load streaming response schema
      const streamingResponseSchema = JSON.parse(
        readFileSync(join(schemasDir, 'streaming-response.schema.json'), 'utf8')
      );
      this.streamingResponseValidator = this.ajv.compile<StreamingResponse>(streamingResponseSchema);

    } catch (error) {
      console.error('Error loading canonical schemas:', error);
      throw new Error('Failed to initialize canonical validator');
    }
  }

  validateRequest(data: unknown): { valid: boolean; data?: Request; errors?: string[] } {
    if (!this.requestValidator) {
      return { valid: false, errors: ['Request validator not initialized'] };
    }

    if (data === null || data === undefined) {
      return { valid: false, errors: ['Request data is null or undefined'] };
    }

    const valid = this.requestValidator(data);
    
    if (valid) {
      return { valid: true, data: data as Request };
    } else {
      const errors = this.requestValidator.errors?.map(error => 
        `${error.instancePath} ${error.message}`
      ) || ['Unknown validation error'];
      return { valid: false, errors };
    }
  }

  validateResponse(data: unknown): { valid: boolean; data?: Response; errors?: string[] } {
    if (!this.responseValidator) {
      return { valid: false, errors: ['Response validator not initialized'] };
    }

    if (data === null || data === undefined) {
      return { valid: false, errors: ['Response data is null or undefined'] };
    }

    const valid = this.responseValidator(data);
    
    if (valid) {
      return { valid: true, data: data as Response };
    } else {
      const errors = this.responseValidator.errors?.map(error => 
        `${error.instancePath} ${error.message}`
      ) || ['Unknown validation error'];
      return { valid: false, errors };
    }
  }

  validateStreamingResponse(data: unknown): { valid: boolean; data?: StreamingResponse; errors?: string[] } {
    if (!this.streamingResponseValidator) {
      return { valid: false, errors: ['Streaming response validator not initialized'] };
    }

    if (data === null || data === undefined) {
      return { valid: false, errors: ['Streaming response data is null or undefined'] };
    }

    const valid = this.streamingResponseValidator(data);
    
    if (valid) {
      return { valid: true, data: data as StreamingResponse };
    } else {
      const errors = this.streamingResponseValidator.errors?.map(error => 
        `${error.instancePath} ${error.message}`
      ) || ['Unknown validation error'];
      return { valid: false, errors };
    }
  }

  // Helper method to create canonical request with schema version
  createCanonicalRequest(data: Partial<Request>): Request {
    return {
      schema_version: '1.0.1',
      ...data
    } as Request;
  }

  // Helper method to create canonical response with schema version  
  createCanonicalResponse(data: Partial<Response>): Response {
    return {
      schema_version: '1.0.1',
      ...data
    } as Response;
  }
}

// Singleton instance
const canonicalValidator = new CanonicalValidator();
export default canonicalValidator;