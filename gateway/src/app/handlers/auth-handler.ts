import { Request, Response } from 'express';
import { recoverTypedDataAddress, getAddress, isAddress } from 'viem';
import { logger } from '../../infrastructure/utils/logger.js';
import { tokenManager } from '../../domain/services/token-manager.js';
import { ValidationError, AuthenticationError } from '../../shared/errors/gateway-errors.js';

// Configuration
const TOKEN_TTL = parseInt(process.env.AUTH_TOKEN_TTL || '604800', 10); // 7 days default
const MAX_MESSAGE_AGE = parseInt(process.env.AUTH_MAX_MESSAGE_AGE || '300', 10); // 5 minutes default

interface LoginRequest {
  address: string;
  expiration: number;
  signature: string;
}

interface LoginResponse {
  token: string;
  address: string;
  expiresAt: number;
  expiresIn: number;
}

/**
 * Handles EIP-712 signature-based authentication.
 * Users sign a message with their MetaMask wallet to prove ownership.
 */
export class AuthHandler {
  /**
   * Handle login request with EIP-712 signature verification.
   */
  async handleLogin(req: Request, res: Response): Promise<void> {
    try {
      const { address, expiration, signature } = req.body as LoginRequest;

      // Validate request format
      if (!address || typeof address !== 'string') {
        throw new ValidationError('Missing or invalid address field');
      }

      if (!expiration || typeof expiration !== 'number') {
        throw new ValidationError('Missing or invalid expiration field');
      }

      if (!signature || typeof signature !== 'string') {
        throw new ValidationError('Missing or invalid signature field');
      }

      // Validate address format
      if (!isAddress(address)) {
        throw new ValidationError('Invalid Ethereum address format', { address });
      }

      // Validate expiration timestamp
      const now = Math.floor(Date.now() / 1000);
      const messageAge = now - (expiration - TOKEN_TTL);

      if (expiration <= now) {
        throw new ValidationError('Message has expired', {
          expiration,
          now,
          age: now - expiration
        });
      }

      if (messageAge > MAX_MESSAGE_AGE) {
        throw new ValidationError('Message is too old or expiration window is invalid', {
          expiration,
          now,
          maxAge: MAX_MESSAGE_AGE,
          age: messageAge
        });
      }

      // Verify EIP-712 signature
      const recoveredAddress = await this.verifySignature(address, expiration, signature);

      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        throw new AuthenticationError('Signature does not match claimed address', {
          claimed: address,
          recovered: recoveredAddress
        });
      }

      // Create token
      const token = tokenManager.createToken(address, TOKEN_TTL);
      const expiresAt = now + TOKEN_TTL;

      logger.info('User authenticated via EIP-712 signature', {
        address: getAddress(address),
        expiresIn: TOKEN_TTL,
        requestId: req.requestId,
        module: 'auth-handler'
      });

      const response: LoginResponse = {
        token,
        address: getAddress(address),
        expiresAt,
        expiresIn: TOKEN_TTL
      };

      res.json(response);
    } catch (error) {
      if (error instanceof ValidationError || error instanceof AuthenticationError) {
        logger.warn('Authentication failed', {
          error: error.message,
          code: error.code,
          requestId: req.requestId,
          module: 'auth-handler'
        });
        res.status(error.statusCode).json({
          error: {
            message: error.message,
            type: error.name,
            code: error.code
          }
        });
      } else {
        logger.error('Unexpected error in authentication', error, {
          requestId: req.requestId,
          module: 'auth-handler'
        });
        res.status(500).json({
          error: {
            message: 'Authentication error. Please login again.',
            type: 'AuthenticationError',
            code: 'AUTHENTICATION_ERROR'
          }
        });
      }
    }
  }

  /**
   * Verify EIP-712 signature using viem's verifyTypedData.
   * The signature is recovered against the EIP-712 typed data structure.
   */
  private async verifySignature(address: string, expiration: number, signature: string): Promise<string> {
    try {
      // EIP-712 typed data structure (must match what the frontend signs)
      const domain = {
        name: 'Ekai Gateway',
        version: '1',
        chainId: 23295 // Oasis Sapphire Testnet (0x5aff)
      };

      const types = {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' }
        ],
        Login: [
          { name: 'address', type: 'address' },
          { name: 'expiration', type: 'uint256' }
        ]
      };

      const message = {
        address,
        expiration
      };

      // Recover the address from the signature
      const recoveredAddress = await recoverTypedDataAddress({
        domain,
        types,
        primaryType: 'Login',
        message,
        signature: signature as `0x${string}`
      });

      // Compare recovered address with claimed address
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        throw new AuthenticationError('Signature does not match claimed address');
      }

      return address;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      // Wrap viem errors
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new AuthenticationError(`Signature verification failed: ${message}`);
    }
  }
}

// Create singleton instance
const authHandler = new AuthHandler();

/**
 * Export handler function that Express can call directly.
 */
export const handleLogin = async (req: Request, res: Response): Promise<void> => {
  await authHandler.handleLogin(req, res);
};
