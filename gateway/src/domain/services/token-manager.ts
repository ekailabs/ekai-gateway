import { randomBytes } from 'crypto';
import { logger } from '../../infrastructure/utils/logger.js';

export interface TokenData {
  address: string;
  expiresAt: number;
  createdAt: number;
}

/**
 * Manages API tokens for authenticated requests.
 * Uses in-memory storage - tokens are cleared on gateway restart.
 */
export class TokenManager {
  private readonly tokenMap = new Map<string, TokenData>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup job to remove expired tokens periodically
    this.startCleanupJob();
  }

  /**
   * Generate a new token and store its mapping to the address.
   * @param address User's wallet address
   * @param ttl Time to live in seconds
   * @returns The generated token (32 bytes hex)
   */
  createToken(address: string, ttl: number): string {
    const token = randomBytes(32).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttl;

    this.tokenMap.set(token, {
      address,
      expiresAt,
      createdAt: now
    });

    logger.info('Token created', {
      address,
      expiresIn: ttl,
      module: 'token-manager'
    });

    return token;
  }

  /**
   * Validate a token and return the associated address if valid.
   * @param token The token to validate
   * @returns The address if valid, null if invalid or expired
   */
  validateToken(token: string): string | null {
    const data = this.tokenMap.get(token);

    if (!data) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);

    if (now > data.expiresAt) {
      // Token expired - remove it
      this.tokenMap.delete(token);
      logger.debug('Token validation failed: expired', {
        address: data.address,
        module: 'token-manager'
      });
      return null;
    }

    return data.address;
  }

  /**
   * Revoke a token by removing it.
   * @param token The token to revoke
   */
  revokeToken(token: string): void {
    const data = this.tokenMap.get(token);

    if (data) {
      this.tokenMap.delete(token);
      logger.info('Token revoked', {
        address: data.address,
        module: 'token-manager'
      });
    }
  }

  /**
   * Remove all expired tokens from the map.
   */
  cleanupExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    let removed = 0;

    for (const [token, data] of this.tokenMap.entries()) {
      if (now > data.expiresAt) {
        this.tokenMap.delete(token);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cleanup job removed expired tokens', {
        count: removed,
        remaining: this.tokenMap.size,
        module: 'token-manager'
      });
    }
  }

  /**
   * Start periodic cleanup job to remove expired tokens.
   */
  private startCleanupJob(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);

    // Allow process to exit if this is the only active timer
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    logger.info('Token cleanup job started', {
      intervalMs: 5 * 60 * 1000,
      module: 'token-manager'
    });
  }

  /**
   * Stop the cleanup job (useful for testing).
   */
  stopCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.debug('Token cleanup job stopped', { module: 'token-manager' });
    }
  }

  /**
   * Get current token count (for monitoring).
   */
  getActiveTokenCount(): number {
    return this.tokenMap.size;
  }
}

// Singleton instance
export const tokenManager = new TokenManager();
