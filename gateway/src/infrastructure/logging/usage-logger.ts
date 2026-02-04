/**
 * Usage Logger for On-Chain Receipt Logging
 *
 * After each successful API call, this service logs usage to the
 * EkaiControlPlane contract via the logReceipt() function.
 *
 * Signing modes:
 * - Inside ROFL: Uses @oasisprotocol/rofl-client for transaction signing
 * - Outside ROFL: Falls back to PRIVATE_KEY environment variable
 *
 * This provides an immutable audit trail of all API usage on Sapphire.
 */

import { createPublicClient, createWalletClient, http, type Hex, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getConfig } from '../config/app-config.js';
import { createLogger } from '../utils/logger.js';
import {
  generateRequestHash,
  type SapphireRequestContext,
} from '../middleware/sapphire-context.js';

const logger = createLogger('usage-logger');

/** ROFL socket path - only exists inside ROFL container */
const ROFL_SOCKET_PATH = '/run/rofl-appd.sock';

/**
 * EkaiControlPlane ABI for logReceipt function
 */
const LogReceiptABI = [
  {
    name: 'logReceipt',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestHash', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'delegate', type: 'address' },
      { name: 'providerId', type: 'bytes32' },
      { name: 'modelId', type: 'bytes32' },
      { name: 'promptTokens', type: 'uint32' },
      { name: 'completionTokens', type: 'uint32' },
    ],
    outputs: [],
  },
] as const;

/**
 * Token usage from API response
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
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
 * UsageLogger handles on-chain logging of API usage
 *
 * Supports two modes:
 * 1. ROFL mode: Uses ROFL client for authenticated transactions
 * 2. Fallback mode: Uses PRIVATE_KEY for local development
 */
export class UsageLogger {
  private static instance: UsageLogger | null = null;
  private publicClient: ReturnType<typeof createPublicClient> | null = null;
  private walletClient: ReturnType<typeof createWalletClient> | null = null;
  private account: ReturnType<typeof privateKeyToAccount> | null = null;
  private roflClient: any = null;
  private initialized = false;
  private initPromise: Promise<boolean> | null = null;
  private chain: typeof sapphireTestnet | null = null;
  private isInsideRofl = false;

  private constructor() {}

  static getInstance(): UsageLogger {
    if (!UsageLogger.instance) {
      UsageLogger.instance = new UsageLogger();
    }
    return UsageLogger.instance;
  }

  /**
   * Initialize the logger with Sapphire connection
   */
  private async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<boolean> {
    const config = getConfig();

    try {
      // Check if we're inside ROFL
      const fs = await import('fs');
      this.isInsideRofl = fs.existsSync(ROFL_SOCKET_PATH);

      // Build chain config
      this.chain = {
        ...sapphireTestnet,
        id: config.sapphire.chainId,
        rpcUrls: {
          default: { http: [config.sapphire.rpcUrl] },
          public: { http: [config.sapphire.rpcUrl] },
        },
      } as typeof sapphireTestnet;

      // Create public client for reading
      this.publicClient = createPublicClient({
        chain: this.chain,
        transport: http(config.sapphire.rpcUrl),
      });

      if (this.isInsideRofl) {
        // Inside ROFL - use ROFL client for signing
        logger.info({}, 'Running inside ROFL - using ROFL client for transaction signing');
        await this.initializeRoflClient();
      } else {
        // Outside ROFL - use private key fallback
        logger.info({}, 'Running outside ROFL - using PRIVATE_KEY for signing');
        await this.initializeWalletClient();
      }

      this.initialized = true;
      logger.info({ chainId: config.sapphire.chainId, isRofl: this.isInsideRofl }, 'UsageLogger initialized');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize UsageLogger');
      return false;
    }
  }

  /**
   * Initialize ROFL client for signing transactions inside ROFL container
   */
  private async initializeRoflClient(): Promise<void> {
    try {
      const { RoflClient, ROFL_SOCKET_PATH: socketPath } = await import('@oasisprotocol/rofl-client');
      this.roflClient = new RoflClient(socketPath);
      logger.info({}, 'ROFL client initialized for transaction signing');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize ROFL client - falling back to PRIVATE_KEY');
      await this.initializeWalletClient();
    }
  }

  /**
   * Initialize wallet client using PRIVATE_KEY (fallback for non-ROFL)
   */
  private async initializeWalletClient(): Promise<void> {
    const privateKey = process.env.PRIVATE_KEY;

    if (!privateKey) {
      logger.warn({}, 'No PRIVATE_KEY available - usage logging will be disabled');
      return;
    }

    const config = getConfig();

    this.account = privateKeyToAccount(privateKey as Hex);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain!,
      transport: http(config.sapphire.rpcUrl),
    });

    logger.info({}, 'Wallet client initialized with PRIVATE_KEY');
  }

  /**
   * Log a usage receipt on-chain
   *
   * @param context - Sapphire request context
   * @param usage - Token usage from API response
   */
  async logReceipt(
    context: SapphireRequestContext,
    usage: TokenUsage
  ): Promise<void> {
    const initialized = await this.initialize();
    if (!initialized) {
      logger.warn({}, 'UsageLogger not initialized - skipping receipt logging');
      return;
    }

    // Check if we have any signing capability
    if (!this.roflClient && !this.walletClient) {
      logger.warn({}, 'No signing capability available - skipping receipt logging');
      return;
    }

    const config = getConfig();

    try {
      // Generate unique request hash
      const requestHash = generateRequestHash(
        context.owner,
        context.delegate,
        context.providerId,
        context.modelId,
        context.timestamp
      );

      // Ensure token counts fit in uint32
      const promptTokens = Math.min(usage.promptTokens, 0xFFFFFFFF);
      const completionTokens = Math.min(usage.completionTokens, 0xFFFFFFFF);

      logger.debug({
        requestHash,
        owner: context.owner,
        delegate: context.delegate,
        providerId: context.providerId,
        modelId: context.modelId,
        promptTokens,
        completionTokens,
      }, 'Logging receipt on-chain');

      let txHash: string;

      if (this.roflClient) {
        // Use ROFL client for signing (inside ROFL container)
        txHash = await this.logReceiptViaRofl(
          config.sapphire.controlPlaneAddress as Hex,
          requestHash,
          context,
          promptTokens,
          completionTokens
        );
      } else if (this.walletClient && this.account && this.chain) {
        // Use wallet client (fallback)
        txHash = await this.walletClient.writeContract({
          address: config.sapphire.controlPlaneAddress as Hex,
          abi: LogReceiptABI,
          functionName: 'logReceipt',
          args: [
            requestHash,
            context.owner,
            context.delegate,
            context.providerId,
            context.modelId,
            promptTokens,
            completionTokens,
          ],
          chain: this.chain,
        } as any);
      } else {
        logger.warn({}, 'No signing method available');
        return;
      }

      logger.info({
        txHash,
        owner: context.owner,
        provider: context.providerName,
        model: context.modelName,
        promptTokens,
        completionTokens,
      }, 'Receipt logged on-chain');

    } catch (error) {
      // Don't throw - logging failures shouldn't break the API response
      logger.error({
        error,
        owner: context.owner,
        provider: context.providerName,
        model: context.modelName,
      }, 'Failed to log receipt on-chain');
    }
  }

  /**
   * Log receipt using ROFL client's transaction signing
   */
  private async logReceiptViaRofl(
    contractAddress: Hex,
    requestHash: Hex,
    context: SapphireRequestContext,
    promptTokens: number,
    completionTokens: number
  ): Promise<string> {
    // Encode the function call data
    const data = encodeFunctionData({
      abi: LogReceiptABI,
      functionName: 'logReceipt',
      args: [
        requestHash,
        context.owner,
        context.delegate,
        context.providerId,
        context.modelId,
        promptTokens,
        completionTokens,
      ],
    });

    // Use ROFL client to submit the transaction
    // The ROFL runtime handles authentication via roflEnsureAuthorizedOrigin
    const txHash = await this.roflClient.submitTransaction({
      to: contractAddress,
      data,
      value: '0x0',
    });

    return txHash;
  }

  /**
   * Extract token usage from provider response
   */
  extractUsage(response: any): TokenUsage {
    // Default to 0 if we can't extract usage
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      // Anthropic format
      if (response.usage) {
        promptTokens = response.usage.input_tokens || response.usage.prompt_tokens || 0;
        completionTokens = response.usage.output_tokens || response.usage.completion_tokens || 0;
      }

      // OpenAI format
      if (response.usage?.prompt_tokens) {
        promptTokens = response.usage.prompt_tokens;
        completionTokens = response.usage.completion_tokens || 0;
      }

      // Canonical format
      if (response.usage?.inputTokens) {
        promptTokens = response.usage.inputTokens;
        completionTokens = response.usage.outputTokens || 0;
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to extract token usage from response');
    }

    return { promptTokens, completionTokens };
  }

  /**
   * Check if usage logging is available
   */
  async isAvailable(): Promise<boolean> {
    const initialized = await this.initialize();
    return initialized && (this.roflClient !== null || this.walletClient !== null);
  }

  /**
   * Check if running inside ROFL container
   */
  isRunningInsideRofl(): boolean {
    return this.isInsideRofl;
  }
}

// Export singleton getter
export function getUsageLogger(): UsageLogger {
  return UsageLogger.getInstance();
}
