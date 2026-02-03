/**
 * Usage Logger for On-Chain Receipt Logging
 *
 * After each successful API call, this service logs usage to the
 * EkaiControlPlane contract via the logReceipt() function.
 *
 * This provides an immutable audit trail of all API usage on Sapphire.
 */

import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getConfig } from '../config/app-config.js';
import { createLogger } from '../utils/logger.js';
import {
  generateRequestHash,
  type SapphireRequestContext,
} from '../middleware/sapphire-context.js';

const logger = createLogger('usage-logger');

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
 */
export class UsageLogger {
  private static instance: UsageLogger | null = null;
  private publicClient: ReturnType<typeof createPublicClient> | null = null;
  private walletClient: ReturnType<typeof createWalletClient> | null = null;
  private account: ReturnType<typeof privateKeyToAccount> | null = null;
  private initialized = false;
  private chain: typeof sapphireTestnet | null = null;

  private constructor() {}

  static getInstance(): UsageLogger {
    if (!UsageLogger.instance) {
      UsageLogger.instance = new UsageLogger();
    }
    return UsageLogger.instance;
  }

  /**
   * Initialize the logger with Sapphire connection
   * Uses the gateway's private key for signing transactions
   */
  private async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    const config = getConfig();

    try {
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

      // For wallet client, we need a private key
      // In ROFL, this would be the ROFL app's signing key
      const privateKey = process.env.ROFL_SIGNING_KEY || process.env.PRIVATE_KEY;

      if (privateKey) {
        this.account = privateKeyToAccount(privateKey as Hex);
        this.walletClient = createWalletClient({
          account: this.account,
          chain: this.chain,
          transport: http(config.sapphire.rpcUrl),
        });
      } else {
        logger.warn({}, 'No signing key available - usage logging will be disabled');
        return false;
      }

      this.initialized = true;
      logger.info({ chainId: config.sapphire.chainId }, 'UsageLogger initialized');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize UsageLogger');
      return false;
    }
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
    if (!initialized || !this.walletClient || !this.account || !this.chain) {
      logger.warn({ context }, 'UsageLogger not initialized - skipping receipt logging');
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

      // Call logReceipt on the contract
      const hash = await this.walletClient.writeContract({
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

      logger.info({
        txHash: hash,
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
    return this.initialize();
  }
}

// Export singleton getter
export function getUsageLogger(): UsageLogger {
  return UsageLogger.getInstance();
}
