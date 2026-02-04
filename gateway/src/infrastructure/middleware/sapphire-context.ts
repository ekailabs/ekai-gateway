/**
 * Sapphire Request Context
 *
 * Extracts owner, delegate, providerId, and modelId from user preferences
 * and request body for use in the ROFL authorization workflow.
 */

import { Request, Response, NextFunction } from 'express';
import { keccak256, toHex, stringToHex, encodePacked, type Hex } from 'viem';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('sapphire-context');

/**
 * Provider ID mapping
 * Maps provider names to bytes32 format for contract calls
 */
export const PROVIDER_IDS = {
  anthropic: 'anthropic',
  openai: 'openai',
  openrouter: 'openrouter',
  xai: 'xai',
  zai: 'zai',
  google: 'google',
} as const;

export type ProviderName = keyof typeof PROVIDER_IDS;

/**
 * Request context for ROFL authorization
 */
export interface SapphireRequestContext {
  /** Owner address (the user who stored the API key - from apiAddress) */
  owner: Hex;
  /** Delegate address (the user making the request - from address) */
  delegate: Hex;
  /** Provider ID as bytes32 */
  providerId: Hex;
  /** Model ID as bytes32 */
  modelId: Hex;
  /** Original provider name */
  providerName: string;
  /** Original model name */
  modelName: string;
  /** Request timestamp */
  timestamp: number;
}

// Extend Express Request type to include sapphire context
declare global {
  namespace Express {
    interface Request {
      sapphireContext?: SapphireRequestContext;
    }
  }
}

/**
 * Convert a string to bytes32 format
 * Pads with zeros to 32 bytes
 */
export function stringToBytes32(str: string): Hex {
  // Encode the string to UTF-8 bytes
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);

  // Create a 32-byte array filled with zeros
  const bytes32 = new Uint8Array(32);

  // Copy the encoded string (max 32 bytes)
  const copyLength = Math.min(encoded.length, 32);
  bytes32.set(encoded.slice(0, copyLength));

  // Convert to hex
  return toHex(bytes32);
}

/**
 * Get provider ID in bytes32 format
 */
export function getProviderIdBytes32(providerName: string): Hex {
  const normalized = providerName.toLowerCase();
  return stringToBytes32(normalized);
}

/**
 * Get model ID in bytes32 format
 */
export function getModelIdBytes32(modelName: string): Hex {
  // For model IDs, we use the first 32 bytes of keccak256 hash
  // This handles long model names while ensuring uniqueness
  if (modelName.length <= 32) {
    return stringToBytes32(modelName);
  }
  // For long model names, hash them
  return keccak256(stringToHex(modelName));
}

/**
 * Generate a unique request hash for on-chain logging
 * Uses ABI-encoded packing to ensure correct byte alignment
 */
export function generateRequestHash(
  owner: Hex,
  delegate: Hex,
  providerId: Hex,
  modelId: Hex,
  timestamp: number
): Hex {
  // Use encodePacked for proper ABI encoding
  // This matches Solidity's abi.encodePacked(owner, delegate, providerId, modelId, timestamp)
  const packed = encodePacked(
    ['address', 'address', 'bytes32', 'bytes32', 'uint64'],
    [owner, delegate, providerId, modelId, BigInt(timestamp)]
  );
  return keccak256(packed);
}

/**
 * Extract provider name from model string
 * Models may be prefixed with provider (e.g., "anthropic/claude-3-opus")
 */
export function extractProviderFromModel(model: string): { provider: string | null; model: string } {
  const lowerModel = model.toLowerCase();

  // Check for provider prefix (e.g., "anthropic/claude-3-opus")
  const prefixMatch = model.match(/^(anthropic|openai|openrouter|google|xai|zai)\/(.*)/i);
  if (prefixMatch) {
    return {
      provider: prefixMatch[1].toLowerCase(),
      model: prefixMatch[2],
    };
  }

  // Infer provider from model name patterns
  // Anthropic: claude-* models
  if (lowerModel.includes('claude')) {
    return { provider: 'anthropic', model };
  }

  // OpenAI: gpt-*, o1-*, o3-*, o4-* models (with word boundary check)
  // Use regex to avoid false positives like "pro1" matching "o1"
  if (lowerModel.includes('gpt') || /\bo[134]-|\bo[134]$|\bo[134]\b/.test(lowerModel)) {
    return { provider: 'openai', model };
  }

  // xAI: grok-* models
  if (lowerModel.includes('grok')) {
    return { provider: 'xai', model };
  }

  // Google: gemini-* models
  if (lowerModel.includes('gemini')) {
    return { provider: 'google', model };
  }

  return { provider: null, model };
}

/**
 * Middleware to extract Sapphire request context from user preferences
 *
 * This middleware extracts:
 * - owner: From user preferences (apiAddress - the user who owns the API keys)
 * - delegate: From user preferences (address - the user making the request)
 * - providerId: Inferred from model name in request body
 * - modelId: From request body model field
 *
 * The context is attached to req.sapphireContext for use by KeyManager
 */
export function sapphireContext(req: Request, res: Response, next: NextFunction): void {
  try {
    // Get owner and delegate from user preferences (set by auth middleware)
    const user = req.user;
    if (!user) {
      // No authenticated user - context will be created later if needed
      logger.debug({ requestId: req.requestId }, 'No authenticated user - skipping Sapphire context');
      next();
      return;
    }

    // owner = apiAddress (the user who stored the API keys)
    // delegate = address (the user making the request)
    const owner = user.apiAddress as Hex;
    const delegate = user.address as Hex;

    // Get model from request body
    const model = req.body?.model as string | undefined;

    if (!model) {
      // No model in request - context will be created later when model is determined
      logger.debug({
        requestId: req.requestId,
        owner,
        delegate,
      }, 'No model in request body - partial Sapphire context');
      next();
      return;
    }

    // Extract provider from model name
    const extracted = extractProviderFromModel(model);
    const providerName = extracted.provider;
    const modelName = extracted.model;

    if (!providerName) {
      logger.debug({
        requestId: req.requestId,
        model,
      }, 'Could not infer provider from model - context will be completed later');
      next();
      return;
    }

    // Create the full context
    const providerId = getProviderIdBytes32(providerName);
    const modelId = getModelIdBytes32(modelName);
    const timestamp = Date.now();

    req.sapphireContext = {
      owner,
      delegate,
      providerId,
      modelId,
      providerName,
      modelName,
      timestamp,
    };

    logger.debug({
      requestId: req.requestId,
      owner,
      delegate,
      providerName,
      modelName,
    }, 'Sapphire context created from user preferences');

    next();
  } catch (error) {
    logger.error({ error, requestId: req.requestId }, 'Error extracting Sapphire context');
    next();
  }
}

/**
 * Create or update Sapphire context with provider and model info
 * Called by provider service when provider/model are determined
 *
 * Uses user preferences for owner/delegate addresses
 */
export function createSapphireContext(
  req: Request,
  providerName: string,
  modelName: string
): SapphireRequestContext | null {
  // Get owner and delegate from user preferences
  const user = req.user;
  if (!user) {
    logger.warn({ requestId: req.requestId }, 'Cannot create Sapphire context - no authenticated user');
    return null;
  }

  // owner = apiAddress (the user who stored the API keys)
  // delegate = address (the user making the request)
  const owner = user.apiAddress as Hex;
  const delegate = user.address as Hex;

  const providerId = getProviderIdBytes32(providerName);
  const modelId = getModelIdBytes32(modelName);
  const timestamp = Date.now();

  const context: SapphireRequestContext = {
    owner,
    delegate,
    providerId,
    modelId,
    providerName,
    modelName,
    timestamp,
  };

  // Update request context
  req.sapphireContext = context;

  logger.debug({
    requestId: req.requestId,
    owner,
    delegate,
    providerName,
    modelName,
  }, 'Sapphire context created');

  return context;
}
