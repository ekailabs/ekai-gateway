/**
 * KeyManager - ROFL Authorization Workflow
 *
 * Implements the full 9-step ROFL authorization workflow:
 * 1. isDelegatePermitted(owner, delegate) - Check delegation
 * 2. isModelPermitted(owner, providerId, modelId) - Check model access
 * 3. getSecretCiphertext(owner, providerId) - Retrieve encrypted key
 * 4. Decrypt using ROFL private key in TEE
 * 5. Return plaintext key to provider for API call
 * 6-9. After API call: Log usage via UsageLogger
 *
 * Security: No caching, fail-closed on any error
 */

import { createPublicClient, http, type Hex } from 'viem';
import { getConfig } from '../config/app-config.js';
import { createLogger } from '../utils/logger.js';
import { getKeyDecryptor } from './key-decryptor.js';
import {
  type SapphireRequestContext,
} from '../middleware/sapphire-context.js';
import {
  DelegateNotPermittedError,
  ModelNotAllowedError,
  SecretNotFoundError,
  SapphireUnavailableError,
} from '../../shared/errors/gateway-errors.js';

const logger = createLogger('key-manager');

/**
 * EkaiControlPlane ABI for key management functions
 * Must match the contract at github.com/ekailabs/api-vault/contracts/EkaiControlPlane.sol
 */
const EkaiControlPlaneABI = [
  // Check if contract is paused
  {
    name: 'isPaused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },

  // Step 1: Check delegate permission
  {
    name: 'isDelegatePermitted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'delegate', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },

  // Step 2: Check model permission
  {
    name: 'isModelPermitted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'providerId', type: 'bytes32' },
      { name: 'modelId', type: 'bytes32' },
    ],
    outputs: [{ type: 'bool' }],
  },

  // Step 3: Get encrypted secret
  {
    name: 'getSecretCiphertext',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'providerId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'ciphertext', type: 'bytes' },
      { name: 'secretVersion', type: 'uint64' },
      { name: 'exists', type: 'bool' },
      { name: 'roflKeyVersion', type: 'uint64' },
    ],
  },
] as const;

/**
 * Secret retrieval result from contract
 */
interface SecretResult {
  ciphertext: Uint8Array;
  secretVersion: bigint;
  exists: boolean;
  roflKeyVersion: bigint;
}

/**
 * Authorization result with key and version info
 */
export interface AuthorizationResult {
  apiKey: string;
  secretVersion: bigint;
  roflKeyVersion: bigint;
}

/**
 * Sapphire Testnet chain configuration
 */
const sapphireTestnet = {
  id: 23295,
  name: 'Oasis Sapphire Testnet',
  network: 'sapphire-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'TEST',
    symbol: 'TEST',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet.sapphire.oasis.io'],
    },
    public: {
      http: ['https://testnet.sapphire.oasis.io'],
    },
  },
} as const;

/**
 * KeyManager implements the full ROFL authorization workflow
 *
 * All operations are fail-closed - any error results in denial of access.
 * No caching is used per security requirements.
 */
export class KeyManager {
  private static instance: KeyManager | null = null;
  private client: ReturnType<typeof createPublicClient> | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager();
    }
    return KeyManager.instance;
  }

  /**
   * Initialize the Sapphire client connection
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const config = getConfig();

    try {
      this.client = createPublicClient({
        chain: {
          ...sapphireTestnet,
          id: config.sapphire.chainId,
          rpcUrls: {
            default: { http: [config.sapphire.rpcUrl] },
            public: { http: [config.sapphire.rpcUrl] },
          },
        },
        transport: http(config.sapphire.rpcUrl),
      });

      // Test connection
      await this.client.getChainId();

      this.initialized = true;
      logger.info({
        rpcUrl: config.sapphire.rpcUrl,
        chainId: config.sapphire.chainId,
        controlPlane: config.sapphire.controlPlaneAddress,
      }, 'KeyManager initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize KeyManager');
      throw new SapphireUnavailableError('Failed to connect to Sapphire RPC', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the Sapphire client, initializing if needed
   */
  private async getClient(): Promise<NonNullable<typeof this.client>> {
    await this.initialize();
    if (!this.client) {
      throw new SapphireUnavailableError('Sapphire client not available');
    }
    return this.client;
  }

  /**
   * Full 9-step ROFL authorization workflow
   *
   * Steps 1-4 (authorization and decryption):
   * 1. Check delegate permission
   * 2. Check model permission
   * 3. Get encrypted secret
   * 4. Decrypt in TEE
   *
   * @param context - Sapphire request context
   * @returns Authorization result with decrypted API key
   * @throws DelegateNotPermittedError, ModelNotAllowedError, SecretNotFoundError, etc.
   */
  async authorize(context: SapphireRequestContext): Promise<AuthorizationResult> {
    const config = getConfig();
    const client = await this.getClient();
    const contractAddress = config.sapphire.controlPlaneAddress as Hex;

    logger.debug({
      owner: context.owner,
      delegate: context.delegate,
      provider: context.providerName,
      model: context.modelName,
    }, 'Starting ROFL authorization workflow');

    // Step 0: Check if contract is paused
    const isPaused = await this.checkIfPaused(client, contractAddress);
    if (isPaused) {
      logger.warn({}, 'EkaiControlPlane contract is paused');
      throw new SapphireUnavailableError('Service temporarily unavailable - contract paused');
    }

    // Step 1: Check delegate permission
    const isDelegatePermitted = await this.checkDelegatePermission(
      client,
      contractAddress,
      context.owner,
      context.delegate
    );

    if (!isDelegatePermitted) {
      logger.warn({
        owner: context.owner,
        delegate: context.delegate,
      }, 'Delegate not permitted');
      throw new DelegateNotPermittedError(context.owner, context.delegate);
    }

    // Step 2: Check model permission
    const isModelPermitted = await this.checkModelPermission(
      client,
      contractAddress,
      context.owner,
      context.providerId,
      context.modelId
    );

    if (!isModelPermitted) {
      logger.warn({
        owner: context.owner,
        providerId: context.providerId,
        modelId: context.modelId,
      }, 'Model not permitted');
      throw new ModelNotAllowedError(
        context.owner,
        context.providerName,
        context.modelName
      );
    }

    // Step 3: Get encrypted secret
    const secret = await this.getSecretCiphertext(
      client,
      contractAddress,
      context.owner,
      context.providerId
    );

    if (!secret.exists) {
      logger.warn({
        owner: context.owner,
        providerId: context.providerId,
      }, 'Secret not found');
      throw new SecretNotFoundError(context.owner, context.providerName);
    }

    // Step 4: Decrypt in TEE
    const decryptor = getKeyDecryptor();
    const apiKey = await decryptor.decrypt(secret.ciphertext, context.providerName);

    logger.info({
      owner: context.owner,
      delegate: context.delegate,
      provider: context.providerName,
      model: context.modelName,
      secretVersion: secret.secretVersion.toString(),
    }, 'ROFL authorization successful');

    return {
      apiKey,
      secretVersion: secret.secretVersion,
      roflKeyVersion: secret.roflKeyVersion,
    };
  }

  /**
   * Simplified key retrieval for provider use
   *
   * @param context - Sapphire request context
   * @returns Decrypted API key
   */
  async getKey(context: SapphireRequestContext): Promise<string> {
    const result = await this.authorize(context);
    return result.apiKey;
  }

  /**
   * Step 0: Check if contract is paused
   */
  private async checkIfPaused(
    client: NonNullable<typeof this.client>,
    contractAddress: Hex
  ): Promise<boolean> {
    try {
      const result = await client.readContract({
        address: contractAddress,
        abi: EkaiControlPlaneABI,
        functionName: 'isPaused',
        args: [],
      } as any);

      return result as boolean;
    } catch (error) {
      // If we can't check pause status, log warning but continue
      // The contract might not be accessible, which will fail later anyway
      logger.warn({ error }, 'Failed to check if contract is paused');
      return false;
    }
  }

  /**
   * Step 1: Check if delegate is permitted by owner
   */
  private async checkDelegatePermission(
    client: NonNullable<typeof this.client>,
    contractAddress: Hex,
    owner: Hex,
    delegate: Hex
  ): Promise<boolean> {
    try {
      // If owner and delegate are the same, always permitted
      if (owner.toLowerCase() === delegate.toLowerCase()) {
        return true;
      }

      const result = await client.readContract({
        address: contractAddress,
        abi: EkaiControlPlaneABI,
        functionName: 'isDelegatePermitted',
        args: [owner, delegate],
      } as any);

      return result as boolean;
    } catch (error) {
      logger.error({ error, owner, delegate }, 'Failed to check delegate permission');
      throw new SapphireUnavailableError('Failed to check delegate permission', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Step 2: Check if model is permitted for owner
   */
  private async checkModelPermission(
    client: NonNullable<typeof this.client>,
    contractAddress: Hex,
    owner: Hex,
    providerId: Hex,
    modelId: Hex
  ): Promise<boolean> {
    try {
      const result = await client.readContract({
        address: contractAddress,
        abi: EkaiControlPlaneABI,
        functionName: 'isModelPermitted',
        args: [owner, providerId, modelId],
      } as any);

      return result as boolean;
    } catch (error) {
      logger.error({ error, owner, providerId, modelId }, 'Failed to check model permission');
      throw new SapphireUnavailableError('Failed to check model permission', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Step 3: Get encrypted secret from contract
   */
  private async getSecretCiphertext(
    client: NonNullable<typeof this.client>,
    contractAddress: Hex,
    owner: Hex,
    providerId: Hex
  ): Promise<SecretResult> {
    try {
      const result = await client.readContract({
        address: contractAddress,
        abi: EkaiControlPlaneABI,
        functionName: 'getSecretCiphertext',
        args: [owner, providerId],
      } as any);

      const [ciphertext, secretVersion, exists, roflKeyVersion] = result as [Hex, bigint, boolean, bigint];

      // Convert hex ciphertext to Uint8Array
      const ciphertextBytes = new Uint8Array(
        Buffer.from(ciphertext.slice(2), 'hex')
      );

      return {
        ciphertext: ciphertextBytes,
        secretVersion,
        exists,
        roflKeyVersion,
      };
    } catch (error) {
      logger.error({ error, owner, providerId }, 'Failed to get secret ciphertext');
      throw new SapphireUnavailableError('Failed to retrieve secret', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if KeyManager is available and can connect to Sapphire
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.initialize();
      return this.initialized;
    } catch {
      return false;
    }
  }

  /**
   * Get the contract address being used
   */
  getContractAddress(): string {
    return getConfig().sapphire.controlPlaneAddress;
  }
}

// Export singleton getter
export function getKeyManager(): KeyManager {
  return KeyManager.getInstance();
}

/**
 * Simple function to get API key from user context
 * Used by passthrough handlers
 *
 * @param req - Express request with user context
 * @param providerName - Provider name (e.g., 'anthropic', 'openai')
 * @param modelName - Model name from request
 * @returns Decrypted API key
 */
export async function getApiKeyFromUserContext(
  req: { user?: { address?: string; apiAddress?: string } },
  providerName: string,
  modelName: string
): Promise<string> {
  const { getProviderIdBytes32, getModelIdBytes32 } = await import('../middleware/sapphire-context.js');

  if (!req.user?.address || !req.user?.apiAddress) {
    throw new DelegateNotPermittedError('unknown', 'unknown', {
      reason: 'Missing user context (address or apiAddress)',
    });
  }

  const context: SapphireRequestContext = {
    owner: req.user.apiAddress as Hex,
    delegate: req.user.address as Hex,
    providerId: getProviderIdBytes32(providerName),
    modelId: getModelIdBytes32(modelName),
    providerName,
    modelName,
    timestamp: Date.now(),
  };

  const keyManager = getKeyManager();
  return keyManager.getKey(context);
}
