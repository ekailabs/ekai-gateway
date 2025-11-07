/**
 * x402 Payment Protocol Integration
 * 
 * This module provides x402 payment support for services that require
 * cryptocurrency payments. Currently used for OpenRouter chat completions
 * when accessing the x402 payment gateway.
 * 
 * @see https://docs.cdp.coinbase.com/x402/quickstart-for-buyers
 */

export { getX402Account, isX402Available } from './wallet.js';
export { createX402Fetch, extractPaymentInfo, extractPaymentAmountUSD, logPaymentInfo, logPaymentReady } from './client.js';
export type { X402PaymentInfo } from './client.js';

