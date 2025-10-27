import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch';
import type { PrivateKeyAccount } from 'viem/accounts';
import { logger } from '../../utils/logger.js';

export interface X402PaymentInfo {
  transactionHash?: string;
  amount?: string;
  token?: string;
  network?: string;
  [key: string]: any;
}

/**
 * Creates a payment-enabled fetch function for x402 protocol.
 * 
 * @param account - Viem PrivateKeyAccount for signing payments
 * @returns Wrapped fetch function that handles 402 Payment Required responses
 */
export function createX402Fetch(account: PrivateKeyAccount): typeof fetch {
  return wrapFetchWithPayment(fetch, account);
}

/**
 * Extracts and decodes payment information from x-payment-response header.
 * 
 * @param response - Fetch Response object
 * @returns Decoded payment info or null if not present
 */
export function extractPaymentInfo(response: Response): X402PaymentInfo | null {
  const paymentHeader = response.headers.get('x-payment-response');
  
  if (!paymentHeader) {
    return null;
  }

  try {
    return decodeXPaymentResponse(paymentHeader);
  } catch (error) {
    logger.debug('Could not decode x-payment-response header', {
      error: error instanceof Error ? error.message : String(error),
      module: 'x402-client',
    });
    return null;
  }
}

/**
 * Logs payment information from a completed x402 transaction.
 * 
 * @param paymentInfo - Payment details from x-payment-response header
 * @param context - Additional context for logging
 */
export function logPaymentInfo(
  paymentInfo: X402PaymentInfo,
  context?: { provider?: string; model?: string }
): void {
  logger.info('x402 payment completed', {
    transactionHash: paymentInfo.transactionHash,
    amount: paymentInfo.amount,
    token: paymentInfo.token,
    network: paymentInfo.network,
    ...context,
    module: 'x402-client',
  });
}

/**
 * Logs x402 payment readiness.
 * 
 * @param account - Viem account address
 * @param context - Additional context for logging
 */
export function logPaymentReady(
  account: { address: string },
  context?: { provider?: string; baseUrl?: string }
): void {
  logger.debug('x402 payment wallet ready', {
    walletAddress: account.address,
    ...context,
    module: 'x402-client',
  });
}

