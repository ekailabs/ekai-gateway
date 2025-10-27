# Payments Infrastructure

This directory contains payment protocol integrations for the Ekai Gateway.

## x402 Payment Protocol

The x402 module implements support for the [Coinbase x402 Payment Protocol](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers), which enables cryptocurrency payments for API services.

### How It Works

1. **Initial Request**: Gateway makes a normal request to the x402-enabled endpoint
2. **402 Response**: If payment is required, server returns HTTP 402 (Payment Required)
3. **Automatic Payment**: x402-fetch wrapper intercepts the 402, extracts payment requirements, creates on-chain payment
4. **Request Retry**: Request is automatically retried with payment proof header
5. **Service Access**: Service validates payment and returns the requested resource

### Current Implementation

- **Provider**: OpenRouter chat completions
- **Network**: EVM-compatible chains (Base Sepolia, etc.)
- **Currency**: USDC
- **Wallet**: Viem-based private key wallet

### Configuration

Set environment variables:

```bash
# Required for x402 payments
PRIVATE_KEY=0x...  # EVM private key with USDC balance

# Optional: override x402 endpoint
X402_URL=https://x402.ekailabs.xyz/v1/chat/completions
```

### Module Structure

```
payments/
└── x402/
    ├── wallet.ts    # Viem wallet creation and management
    ├── client.ts    # x402-fetch wrapper and payment utilities
    ├── index.ts     # Public API exports
    └── README.md    # Detailed documentation
```

### Features

- ✅ Automatic 402 handling
- ✅ Payment verification
- ✅ Request retry with payment proof
- ✅ Payment logging and tracking
- ✅ Graceful fallback on errors
- ✅ Modular architecture for future protocols

### Usage Example

```typescript
import { getX402Account, createX402Fetch } from './payments/x402/index.js';

const account = getX402Account();
if (account) {
  const fetchWithPayment = createX402Fetch(account);
  // Use fetchWithPayment instead of standard fetch
  const response = await fetchWithPayment(url, options);
}
```

### Future Extensions

This modular structure allows easy addition of other payment protocols:
- Lightning Network
- Other token standards
- Different blockchain networks

