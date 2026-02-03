/**
 * TEE-specific decryption using ROFL SDK
 *
 * This module handles decryption of secrets using the Oasis ROFL private key.
 * It only works when running as a ROFL app inside a TEE (Trusted Execution Environment).
 *
 * Secrets are encrypted with the ROFL public key by the EkaiControlPlane contract,
 * and can only be decrypted by the ROFL app running in the enclave.
 */

import { DecryptionFailedError } from '../../shared/errors/gateway-errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('key-decryptor');

/**
 * Interface for the decryption result
 */
export interface DecryptionResult {
  plaintext: string;
}

/**
 * ROFL SDK interface (available only in TEE environment)
 * The actual SDK is injected by the Oasis runtime when running as a ROFL app
 */
interface RoflSdk {
  getPrivateKey(): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array>;
}

/**
 * KeyDecryptor handles decryption of secrets in TEE environment
 *
 * In ROFL deployment:
 * - Secrets are encrypted with ROFL public key by the contract
 * - Only the ROFL app running in TEE can decrypt using its private key
 * - The ROFL SDK provides access to the private key within the enclave
 */
export class KeyDecryptor {
  private static instance: KeyDecryptor | null = null;

  private constructor() {}

  static getInstance(): KeyDecryptor {
    if (!KeyDecryptor.instance) {
      KeyDecryptor.instance = new KeyDecryptor();
    }
    return KeyDecryptor.instance;
  }

  /**
   * Decrypt ciphertext using ROFL private key
   *
   * This method requires the gateway to be running as a ROFL app inside a TEE.
   * The ROFL_APP_ID environment variable must be set by the Oasis runtime.
   *
   * @param ciphertext - The encrypted data from the contract
   * @param providerId - Provider ID for error context
   * @returns Decrypted plaintext (API key)
   * @throws DecryptionFailedError if decryption fails or not in TEE
   */
  async decrypt(ciphertext: Uint8Array, providerId: string): Promise<string> {
    logger.debug({ providerId }, 'Attempting ROFL decryption in TEE');

    try {
      // Check if we're in a ROFL environment
      const roflAppId = process.env.ROFL_APP_ID;

      if (!roflAppId) {
        logger.error({ providerId }, 'ROFL_APP_ID not set - not running in TEE');
        throw new Error('Not running in ROFL TEE environment. ROFL_APP_ID is required.');
      }

      // Attempt to use ROFL SDK for decryption
      // This will be available when running inside the TEE
      const plaintext = await this.roflDecrypt(ciphertext);

      if (!plaintext || plaintext.length === 0) {
        throw new Error('Decryption returned empty result');
      }

      logger.info({ providerId }, 'ROFL decryption successful');
      return plaintext;

    } catch (error) {
      logger.error({ error, providerId }, 'ROFL decryption failed');
      throw new DecryptionFailedError(providerId, {
        reason: 'rofl_decryption_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Perform ROFL decryption using the enclave's private key
   *
   * This method uses the Oasis ROFL SDK to access the enclave's private key
   * and decrypt the ciphertext that was encrypted with the corresponding public key.
   *
   * The ROFL SDK is injected by the Oasis runtime when running as a ROFL app.
   * It provides access to the enclave's cryptographic capabilities.
   */
  private async roflDecrypt(ciphertext: Uint8Array): Promise<string> {
    try {
      // The ROFL SDK is available as a global when running in TEE
      // or can be accessed via the Oasis runtime injection
      const rofl = await this.getRoflSdk();

      // Get the ROFL private key from the enclave
      const privateKey = await rofl.getPrivateKey();

      // Decrypt the ciphertext
      // The ciphertext was encrypted using x25519-xsalsa20-poly1305
      // with the ROFL public key
      const decrypted = await rofl.decrypt(ciphertext, privateKey);

      // Convert decrypted bytes to string (UTF-8)
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('ROFL SDK not available')) {
        throw error;
      }

      throw new Error(`ROFL decryption failed: ${message}`);
    }
  }

  /**
   * Get the ROFL SDK instance
   *
   * The SDK is provided by the Oasis runtime when running as a ROFL app.
   * This method attempts to access the SDK through various mechanisms:
   * 1. Global injection by Oasis runtime
   * 2. Dynamic import of ROFL-specific module
   */
  private async getRoflSdk(): Promise<RoflSdk> {
    // Check for globally injected ROFL SDK (set by Oasis runtime in TEE)
    const globalRofl = (globalThis as any).__OASIS_ROFL_SDK__;
    if (globalRofl) {
      return globalRofl as RoflSdk;
    }

    // Try to import ROFL SDK from the runtime-injected module
    // This module path is provided by Oasis when running as a ROFL app
    try {
      const roflModule = await import('@oasis-rofl/sdk' as string);
      if (roflModule.default || roflModule.rofl) {
        return (roflModule.default || roflModule.rofl) as RoflSdk;
      }
    } catch {
      // Module not available - not in TEE
    }

    throw new Error(
      'ROFL SDK not available. Ensure the gateway is running as a ROFL app in TEE. ' +
      'The SDK is injected by the Oasis runtime and is only available inside the enclave.'
    );
  }

  /**
   * Check if decryption is available
   * Returns true only if running in TEE with ROFL_APP_ID set
   */
  isAvailable(): boolean {
    return !!process.env.ROFL_APP_ID;
  }
}

// Export singleton getter
export function getKeyDecryptor(): KeyDecryptor {
  return KeyDecryptor.getInstance();
}
