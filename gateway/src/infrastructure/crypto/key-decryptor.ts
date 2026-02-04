/**
 * TEE-specific decryption using X25519-DeoxysII
 *
 * This module handles decryption of secrets encrypted with the ROFL public key.
 * It uses the @oasisprotocol/sapphire-paratime cipher module for X25519-DeoxysII decryption.
 *
 * Key derivation:
 * - Inside ROFL: Uses @oasisprotocol/rofl-client to derive a deterministic key from app identity
 * - Outside ROFL: Falls back to ROFL_PRIVATE_KEY environment variable
 *
 * Secrets are encrypted client-side using the ROFL public key (stored in EkaiControlPlane),
 * and can only be decrypted by the ROFL app using its private key.
 *
 * Encryption format: CBOR-encoded envelope with { pk, nonce, data, epoch? }
 */

import { decode as cborDecode } from 'cborg';
import { cipher } from '@oasisprotocol/sapphire-paratime';
import { DecryptionFailedError } from '../../shared/errors/gateway-errors.js';
import { createLogger } from '../utils/logger.js';

const { X25519DeoxysII, Kind: CipherKind } = cipher;

const logger = createLogger('key-decryptor');

/** Key ID used for ROFL key derivation */
const ROFL_ENCRYPTION_KEY_ID = 'ekai-gateway-encryption-key';

/** ROFL socket path - only exists inside ROFL container */
const ROFL_SOCKET_PATH = '/run/rofl-appd.sock';

/**
 * Interface for the decryption result
 */
export interface DecryptionResult {
  plaintext: string;
}

/**
 * CBOR-encoded envelope format from client-side encryption
 * This matches the format produced by X25519DeoxysII.ephemeral().encryptCall()
 *
 * Format:
 * {
 *   format: CipherKind.X25519DeoxysII (= 1),
 *   body: {
 *     pk: Uint8Array,     // Sender's ephemeral public key
 *     nonce: Uint8Array,  // Random nonce
 *     data: Uint8Array,   // Encrypted data
 *     epoch?: number      // Optional epoch
 *   }
 * }
 */
interface CiphertextEnvelope {
  format: number;
  body: {
    pk: Uint8Array;      // Sender's ephemeral public key
    nonce: Uint8Array;   // Random nonce
    data: Uint8Array;    // Encrypted data
    epoch?: number;      // Optional epoch
  };
}

/**
 * Derive X25519 public key from private key
 * Uses the curve25519 scalar multiplication with basepoint
 */
function deriveX25519PublicKey(privateKey: Uint8Array): Uint8Array {
  // X25519 basepoint (little-endian encoding of 9)
  const basepoint = new Uint8Array(32);
  basepoint[0] = 9;

  // Use the sapphire-paratime's X25519DeoxysII to derive public key
  // The public key is derived by creating a cipher and extracting the public key
  // For X25519, we need to do scalar multiplication: publicKey = privateKey * G

  // Since sapphire-paratime doesn't expose raw X25519 scalar mult,
  // we use tweetnacl-compatible derivation
  // The private key needs to be "clamped" for X25519:
  // - Clear bits 0, 1, 2 of the first byte
  // - Clear bit 7 of the last byte
  // - Set bit 6 of the last byte
  const clampedKey = new Uint8Array(privateKey);
  clampedKey[0] &= 248;
  clampedKey[31] &= 127;
  clampedKey[31] |= 64;

  // We'll use dynamic import of tweetnacl for the scalar multiplication
  // For now, return null and handle async initialization
  return clampedKey; // Placeholder - actual derivation happens in async init
}

/**
 * KeyDecryptor handles decryption of secrets in TEE environment
 *
 * Key sources (in order of priority):
 * 1. ROFL client (when running inside ROFL container)
 * 2. ROFL_PRIVATE_KEY environment variable (for local development)
 *
 * The derived/loaded key is used for X25519-DeoxysII decryption.
 */
export class KeyDecryptor {
  private static instance: KeyDecryptor | null = null;
  private privateKey: Uint8Array | null = null;
  private publicKey: Uint8Array | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private isInsideRofl = false;
  private lastError: string | null = null;

  private constructor() {
    // Initialization happens async
  }

  static getInstance(): KeyDecryptor {
    if (!KeyDecryptor.instance) {
      KeyDecryptor.instance = new KeyDecryptor();
    }
    return KeyDecryptor.instance;
  }

  /**
   * Initialize the decryptor - must be called before use
   * Attempts to load key from ROFL client first, then falls back to env var
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    // Check if we're inside ROFL (socket exists)
    const fs = await import('fs');
    this.isInsideRofl = fs.existsSync(ROFL_SOCKET_PATH);

    if (this.isInsideRofl) {
      logger.info({}, 'Running inside ROFL container - using ROFL key derivation');
      await this.loadKeyFromRofl();
    } else {
      logger.warn({}, 'Not running inside ROFL - key derivation not available');
      this.lastError = 'Not running inside ROFL container';
    }

    // Derive public key if we have a private key
    if (this.privateKey) {
      await this.derivePublicKey();
    }

    this.initialized = true;
  }

  /**
   * Load key from ROFL client using deterministic key derivation
   */
  private async loadKeyFromRofl(): Promise<void> {
    try {
      logger.info({}, 'Attempting ROFL key derivation...');

      // Dynamic import to avoid issues when running outside ROFL
      const { RoflClient, KeyKind } = await import('@oasisprotocol/rofl-client');
      logger.info({}, 'RoflClient imported successfully');

      // RoflClient defaults to ROFL_SOCKET_PATH when no url is specified
      const client = new RoflClient();
      logger.info({}, 'RoflClient instantiated');

      // Generate/derive a deterministic 256-bit key
      // This key is deterministic based on the ROFL app identity
      logger.info({ keyId: ROFL_ENCRYPTION_KEY_ID }, 'Calling generateKey...');
      const keyHex = await client.generateKey(ROFL_ENCRYPTION_KEY_ID, KeyKind.RAW_256);
      logger.info({}, 'generateKey returned successfully');

      // Remove 0x prefix if present
      const cleanHex = keyHex.startsWith('0x') ? keyHex.slice(2) : keyHex;

      this.privateKey = new Uint8Array(
        cleanHex.match(/.{2}/g)!.map((byte: string) => parseInt(byte, 16))
      );

      this.lastError = null;
      logger.info({}, 'ROFL private key derived successfully from app identity');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.lastError = errorMsg;
      logger.error({ error: errorMsg }, 'Failed to derive key from ROFL client');
    }
  }

  /**
   * Derive X25519 public key from the private key
   */
  private async derivePublicKey(): Promise<void> {
    if (!this.privateKey) {
      return;
    }

    try {
      // Use tweetnacl for X25519 scalar multiplication
      const nacl = await import('tweetnacl');

      // tweetnacl's scalarMult.base does X25519 basepoint multiplication
      // First, we need to clamp the private key for X25519
      const clampedKey = new Uint8Array(this.privateKey);
      clampedKey[0] &= 248;
      clampedKey[31] &= 127;
      clampedKey[31] |= 64;

      this.publicKey = nacl.scalarMult.base(clampedKey);

      const pubKeyHex = Buffer.from(this.publicKey).toString('hex');
      logger.info({ publicKey: pubKeyHex }, 'X25519 public key derived');
    } catch (error) {
      logger.error({ error }, 'Failed to derive X25519 public key');
    }
  }

  /**
   * Decrypt ciphertext using ROFL private key with X25519-DeoxysII
   *
   * The ciphertext is expected to be a CBOR-encoded envelope containing:
   * - pk: sender's ephemeral public key (32 bytes)
   * - nonce: random nonce for DeoxysII
   * - data: encrypted data
   *
   * @param ciphertext - The encrypted data from the contract (raw bytes, not CBOR-wrapped)
   * @param providerId - Provider ID for error context
   * @returns Decrypted plaintext (API key)
   * @throws DecryptionFailedError if decryption fails
   */
  async decrypt(ciphertext: Uint8Array, providerId: string): Promise<string> {
    await this.initialize();

    logger.debug({ providerId, ciphertextLength: ciphertext.length }, 'Attempting X25519-DeoxysII decryption');

    if (!this.privateKey) {
      logger.error({ providerId }, 'ROFL private key not available');
      throw new DecryptionFailedError(providerId, {
        reason: 'private_key_not_available',
        error: 'Encryption not available - ROFL key not set or inactive',
      });
    }

    try {
      // Parse the CBOR-encoded envelope
      const envelope = this.parseEnvelope(ciphertext);

      // Extract components from body
      const { pk, nonce, data, epoch } = envelope.body;

      // Create cipher with our private key and sender's ephemeral public key
      const decryptCipher = X25519DeoxysII.fromSecretKey(
        this.privateKey,
        pk,
        epoch
      );

      // Decrypt the data (cipher.decrypt may be sync or async depending on version)
      const plaintextResult = decryptCipher.decrypt(nonce, data);
      const plaintext = plaintextResult instanceof Promise ? await plaintextResult : plaintextResult;

      if (!plaintext || plaintext.length === 0) {
        throw new Error('Decryption returned empty result');
      }

      // Convert to string (UTF-8)
      const result = new TextDecoder().decode(plaintext);

      logger.info({ providerId }, 'X25519-DeoxysII decryption successful');
      return result;

    } catch (error) {
      logger.error({ error, providerId }, 'X25519-DeoxysII decryption failed');

      if (error instanceof DecryptionFailedError) {
        throw error;
      }

      throw new DecryptionFailedError(providerId, {
        reason: 'decryption_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Parse the CBOR-encoded ciphertext envelope
   *
   * The envelope format matches what X25519DeoxysII.ephemeral().encryptCall() produces:
   * {
   *   format: CipherKind.X25519DeoxysII (= 1),
   *   body: { pk, nonce, data, epoch? }
   * }
   */
  private parseEnvelope(ciphertext: Uint8Array): CiphertextEnvelope {
    try {
      const decoded = cborDecode(ciphertext);

      // Validate envelope structure
      if (!decoded || typeof decoded !== 'object') {
        throw new Error('Invalid envelope: not an object');
      }

      const { format, body } = decoded as any;

      // Verify cipher format
      if (format !== CipherKind.X25519DeoxysII) {
        throw new Error(`Unsupported cipher format: expected ${CipherKind.X25519DeoxysII}, got ${format}`);
      }

      // Validate body exists
      if (!body || typeof body !== 'object') {
        throw new Error('Invalid envelope: missing or invalid body');
      }

      const { pk, nonce, data, epoch } = body;

      if (!pk || !(pk instanceof Uint8Array)) {
        throw new Error('Invalid envelope: missing or invalid pk (ephemeral public key)');
      }

      if (pk.length !== 32) {
        throw new Error(`Invalid envelope: pk must be 32 bytes, got ${pk.length}`);
      }

      if (!nonce || !(nonce instanceof Uint8Array)) {
        throw new Error('Invalid envelope: missing or invalid nonce');
      }

      if (!data || !(data instanceof Uint8Array)) {
        throw new Error('Invalid envelope: missing or invalid data');
      }

      return {
        format,
        body: {
          pk,
          nonce,
          data,
          epoch: typeof epoch === 'number' ? epoch : undefined,
        },
      };
    } catch (error) {
      if (error instanceof Error && (
        error.message.startsWith('Invalid envelope:') ||
        error.message.startsWith('Unsupported cipher format:')
      )) {
        throw error;
      }
      throw new Error(`Failed to parse CBOR envelope: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if decryption is available
   * Returns true only if ROFL private key is configured
   */
  async isAvailable(): Promise<boolean> {
    await this.initialize();
    return this.privateKey !== null;
  }

  /**
   * Get the X25519 public key for contract registration
   * Returns hex-encoded public key (without 0x prefix)
   */
  async getPublicKey(): Promise<string | null> {
    await this.initialize();
    if (!this.publicKey) {
      return null;
    }
    return Buffer.from(this.publicKey).toString('hex');
  }

  /**
   * Get the X25519 public key as bytes for contract registration
   */
  async getPublicKeyBytes(): Promise<Uint8Array | null> {
    await this.initialize();
    return this.publicKey;
  }

  /**
   * Check if running inside ROFL container
   */
  isRunningInsideRofl(): boolean {
    return this.isInsideRofl;
  }

  /**
   * Get the last error message from key derivation (for debugging)
   */
  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Reload the private key (useful for testing or key rotation)
   */
  async reloadKey(): Promise<void> {
    this.initialized = false;
    this.initPromise = null;
    this.privateKey = null;
    this.publicKey = null;
    await this.initialize();
  }
}

// Export singleton getter
export function getKeyDecryptor(): KeyDecryptor {
  return KeyDecryptor.getInstance();
}
