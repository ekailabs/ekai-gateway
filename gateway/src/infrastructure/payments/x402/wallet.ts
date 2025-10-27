import { privateKeyToAccount } from 'viem/accounts';
import type { PrivateKeyAccount } from 'viem/accounts';
import { logger } from '../../utils/logger.js';
import { getConfig } from '../../config/app-config.js';

let cachedAccount: PrivateKeyAccount | null = null;
let initialized = false;

/**
 * Gets or creates an x402 payment wallet account from PRIVATE_KEY env var.
 * Returns null if PRIVATE_KEY is not set or invalid.
 * 
 * @returns PrivateKeyAccount for x402 payments, or null if unavailable
 */
export function getX402Account(): PrivateKeyAccount | null {
  if (initialized) {
    return cachedAccount;
  }

  initialized = true;

  const config = getConfig();
  const privateKey = config.x402.privateKey;
  if (!privateKey) {
    logger.warn('PRIVATE_KEY not set, x402 payments disabled', {
      module: 'x402-wallet',
    });
    return null;
  }

  try {
    // Ensure proper hex format
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    cachedAccount = privateKeyToAccount(formattedKey as `0x${string}`);
    
    logger.info('x402 wallet initialized successfully', {
      address: cachedAccount.address,
      module: 'x402-wallet',
    });
    
    return cachedAccount;
  } catch (error) {
    logger.error('Failed to initialize x402 wallet from PRIVATE_KEY', error, {
      module: 'x402-wallet',
    });
    cachedAccount = null;
    return null;
  }
}

/**
 * Checks if x402 payments are available (wallet initialized successfully)
 */
export function isX402Available(): boolean {
  return getX402Account() !== null;
}

