# MetaMask Web3 Authentication Implementation Plan

## Overview
Implement EIP-712 signature-based authentication allowing users to authenticate with MetaMask wallets and receive secure API tokens (EKAI_TOKEN) to access the gateway.

## Architecture Summary

### Authentication Flow
1. **UI Login**: User connects MetaMask → Signs EIP-712 message (address + nonce + expiration)
2. **Backend Verification**: Gateway verifies signature → Generates random EKAI_TOKEN → Maps token to address in RAM
3. **Token Display**: UI shows export commands: `export ANTHROPIC_API_KEY=<EKAI_TOKEN>`
4. **Request Interception**: Gateway middleware extracts token → Validates → Attaches user address to request

### Token Expiration Standard
**Configuration: 7 days** (604800 seconds)
- Developer-friendly: reduces login friction
- Suitable for personal API access tokens
- Can be configured via environment variable

## Implementation Tasks

### Backend Changes (Gateway)

#### 1. Create Authentication Handler
**File**: `gateway/src/app/handlers/auth-handler.ts`

**Responsibilities:**
- Handle POST `/login` endpoint
- Verify EIP-712 signature using `ethers.js`
- Validate signature matches claimed address
- Check expiration timestamp (must be in future and not too far ahead)
- Generate random EKAI_TOKEN (32 bytes hex: crypto.randomBytes(32).toString('hex'))
- Store token mapping in TokenManager
- Return token + expiration info

**Request Format:**
```typescript
{
  address: string,          // User's wallet address
  expiration: number,       // Unix timestamp (seconds)
  signature: string         // EIP-712 signature
}
```

**Response Format:**
```typescript
{
  token: string,        // EKAI_TOKEN
  address: string,
  expiresAt: number,    // Unix timestamp
  expiresIn: number     // Seconds
}
```

#### 2. Create Token Manager Service
**File**: `gateway/src/domain/services/token-manager.ts`

**Responsibilities:**
- In-memory Map storage: `tokenToAddress: Map<string, TokenData>`
- Interface: `{ address: string, expiresAt: number, createdAt: number }`
- Methods:
  - `createToken(address: string, ttl: number): string` - Generate and store token
  - `validateToken(token: string): string | null` - Return address or null if invalid/expired
  - `revokeToken(token: string): void` - Remove token
  - `cleanupExpired(): void` - Remove expired tokens (run periodically)
- Singleton pattern (similar to other services)
- Simple logging for auth events (login, token validation, expiration)

#### 3. Create Authentication Middleware
**File**: `gateway/src/infrastructure/middleware/auth.ts`

**Responsibilities:**
- Extract `Authorization: Bearer <EKAI_TOKEN>` header
- Also check `x-api-key` header for backward compatibility
- Call `tokenManager.validateToken(token)`
- If valid: attach `req.user = { address }` to request
- If invalid: throw `AuthenticationError("Authorization error. Please login again.")`
- Export both `authenticate` (required) and `optionalAuth` (for health check)

#### 4. ~~Add Nonce Manager~~ (REMOVED FROM MVP)
**Simplified Approach**: Rely on message expiration timestamp only
- Nonces add complexity without significant benefit for MVP
- Expiration timestamp prevents indefinite replay
- Can add nonce tracking in v2 if needed

#### 5. Update Server Routes
**File**: `gateway/src/index.ts`

**Changes:**
- Import auth middleware and handler
- Add route: `app.post('/auth/login', handleLogin)` (no auth required)
- Add route: `app.get('/auth/nonce', handleGenerateNonce)` (no auth required)
- Apply auth middleware to protected routes:
  ```typescript
  app.post('/v1/chat/completions', authenticate, handleOpenAIFormatChat);
  app.post('/v1/messages', authenticate, handleAnthropicFormatChat);
  app.post('/v1/responses', authenticate, handleOpenAIResponses);
  app.get('/v1/models', authenticate, handleModelsRequest);
  app.get('/usage', authenticate, handleUsageRequest);
  app.put('/budget', authenticate, handleUpdateBudget);
  // Keep /health and /config/status public
  ```

#### 6. Add Dependencies
**File**: `gateway/package.json`

Add crypto libraries:
- `ethers` (v6.x) - For signature verification and address utilities
- `@noble/hashes` (optional, for nonce generation)

### Frontend Changes (Dashboard)

#### 1. Create Authentication Context
**File**: `ui/dashboard/src/contexts/AuthContext.tsx`

**State:**
```typescript
{
  address: string | null,
  token: string | null,
  expiresAt: number | null,
  isConnected: boolean,
  isLoading: boolean
}
```

**Methods:**
- `connectWallet()` - Connect MetaMask
- `login()` - Sign message and authenticate
- `logout()` - Clear token
- `checkAuth()` - Validate stored token

**Storage**: Use `localStorage` for token persistence across sessions

#### 2. Create Login Page
**File**: `ui/dashboard/src/app/login/page.tsx`

**UI Components:**
- MetaMask connection button
- "Sign to Login" button (after wallet connected)
- Token display area (copyable EKAI_TOKEN)
- Export commands display:
  ```bash
  export ANTHROPIC_BASE_URL=http://localhost:3001
  export ANTHROPIC_API_KEY=<EKAI_TOKEN>
  ```
- Error messages for common issues (MetaMask not installed, signature rejected, etc.)
- Expiration countdown timer

**Flow:**
1. Check if MetaMask installed (`window.ethereum`)
2. Request account access: `eth_requestAccounts`
3. Create EIP-712 typed data structure with current timestamp + 5 min expiration
5. Request signature: `eth_signTypedData_v4`
6. POST to `/auth/login` with signature
7. Store token in context + localStorage
8. Display token and export commands

#### 3. Create Auth Utilities
**File**: `ui/dashboard/src/lib/auth.ts`

**Functions:**
- `connectMetaMask(): Promise<string>` - Connect and return address
- `createEIP712Message(address: string, nonce: string, expiration: number)` - Create typed data
- `signMessage(typedData): Promise<string>` - Request signature from MetaMask
- `isTokenExpired(expiresAt: number): boolean` - Check expiration
- `formatTokenExport(token: string): string` - Format export commands

**EIP-712 Structure (Simplified MVP):**
```typescript
{
  domain: {
    name: "Ekai Gateway",
    version: "1",
    chainId: 23295, // Oasis Sapphire Testnet (0x5aff)
    // Note: Off-chain signing - no transaction, no gas fees
  },
  types: {
    Login: [
      { name: "address", type: "address" },
      { name: "expiration", type: "uint256" }
    ]
  },
  primaryType: "Login",
  message: {
    address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    expiration: 1738367890  // Unix timestamp
  }
}
```

**Note**: Nonce removed for MVP simplicity. Expiration timestamp provides sufficient replay protection.

**Important Note on Network:**
- This is **off-chain signature** authentication (no blockchain transaction)
- No gas fees required, no on-chain state
- Users sign a message with their wallet to prove ownership
- ChainId included for best practices (prevents replay across chains)
- Users can be on any network in MetaMask - the signature still works

#### 4. Update API Service
**File**: `ui/dashboard/src/lib/api.ts`

**Changes:**
- Add auth endpoint: `login(address, expiration, signature)`
- Update all methods to include `Authorization: Bearer ${token}` header
- Get token from AuthContext or localStorage
- Handle 401 errors → redirect to `/login`

#### 5. Add Route Protection
**File**: `ui/dashboard/src/middleware.ts` (create new)

**Logic:**
- Check if token exists and not expired
- If not authenticated and not on `/login` → redirect to `/login`
- If authenticated and on `/login` → redirect to `/`

#### 6. Update Root Layout
**File**: `ui/dashboard/src/app/layout.tsx`

**Changes:**
- Wrap children with `<AuthProvider>`
- Add logout button in header (if authenticated)
- Show connected address in UI

#### 7. Add MetaMask Types
**File**: `ui/dashboard/src/types/metamask.d.ts` (create new)

Define `Window.ethereum` interface for TypeScript support

#### 8. Add Dependencies
**File**: `ui/dashboard/package.json`

Add Web3 libraries:
- `ethers` (v6.x) - For signature utilities (optional, can use window.ethereum directly)
- Or use vanilla Web3 with just `window.ethereum` (lighter weight)

## Critical Files to Modify

### Backend
- ✅ `gateway/src/index.ts` - Add routes and middleware
- ➕ `gateway/src/app/handlers/auth-handler.ts` - NEW
- ➕ `gateway/src/domain/services/token-manager.ts` - NEW
- ~~`gateway/src/domain/services/nonce-manager.ts`~~ - REMOVED FROM MVP
- ➕ `gateway/src/infrastructure/middleware/auth.ts` - NEW
- ✅ `gateway/package.json` - Add ethers

### Frontend
- ➕ `ui/dashboard/src/app/login/page.tsx` - NEW
- ➕ `ui/dashboard/src/contexts/AuthContext.tsx` - NEW
- ➕ `ui/dashboard/src/lib/auth.ts` - NEW
- ✅ `ui/dashboard/src/lib/api.ts` - Update to include auth headers
- ✅ `ui/dashboard/src/app/layout.tsx` - Wrap with AuthProvider
- ➕ `ui/dashboard/src/middleware.ts` - NEW (route protection)
- ➕ `ui/dashboard/src/types/metamask.d.ts` - NEW
- ✅ `ui/dashboard/package.json` - Add ethers (optional)

## Security Considerations (MVP)

1. **HTTPS in Production**: Enforce HTTPS for all auth endpoints (production only)
2. **CORS Configuration**: Restrict origins in gateway CORS middleware
3. **Message Expiration**: EIP-712 message must have expiration (prevents indefinite replay)
4. **Token Storage**: In-memory only (cleared on restart) - acceptable for MVP
5. **Address Validation**: Ensure recovered address matches claimed address

**Deferred to v2:**
- Rate limiting on `/auth/login`
- Nonce tracking for replay prevention
- Token refresh/rotation
- Persistent token storage

## Configuration

### Environment Variables

**Backend** (`gateway/.env`):
```bash
AUTH_TOKEN_TTL=604800          # 7 days in seconds (604800)
AUTH_MAX_MESSAGE_AGE=300       # Max age for EIP-712 message (5 minutes)
AUTH_ENABLED=true              # Feature flag (default: true)
```

**Frontend** (`ui/dashboard/.env.local`):
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_AUTH_MESSAGE="Sign this message to authenticate with Ekai Gateway"
```

## Testing & Verification

### Manual Testing Flow
1. Start gateway: `npm run dev:gateway`
2. Start dashboard: `npm run dev:ui`
3. Open `http://localhost:3000/login`
4. Click "Connect MetaMask" → Approve connection
5. Click "Sign to Login" → Sign EIP-712 message
6. Verify token displayed with export commands
7. Copy token and test with Claude Code:
   ```bash
   export ANTHROPIC_BASE_URL=http://localhost:3001
   export ANTHROPIC_API_KEY=<EKAI_TOKEN>
   claude-code "test request"
   ```
8. Verify gateway logs show address correctly
9. Test token expiration (fast-forward or wait 24 hours)
10. Test invalid token → Should get 401 error

### Unit Tests
**Not included in MVP** - Manual testing only for speed

## Error Messages

All auth errors return:
```json
{
  "error": {
    "message": "Authorization error. Please login again.",
    "type": "AuthenticationError",
    "code": 401
  }
}
```

## MVP Simplifications & Future Enhancements

**Removed from MVP for simplicity:**
- ~~Nonce manager~~ - Using expiration timestamp only
- ~~Unit tests~~ - Manual testing
- ~~Rate limiting~~ - Can add later
- ~~Token refresh~~ - Users re-login after 7 days
- ~~Persistent storage~~ - In-memory Map only

**Future v2 Features:**
- Nonce tracking for additional replay protection
- Token refresh endpoint
- Multi-chain support
- Admin dashboard to view active sessions
- Token revocation UI
- Rate limiting per address
- Database storage for tokens

## Implementation Order

1. **Backend Foundation** (30 min)
   - TokenManager service
   - NonceManager service
   - Auth handler skeleton

2. **Backend Authentication** (45 min)
   - EIP-712 signature verification
   - Nonce validation
   - Auth middleware
   - Update routes

3. **Frontend Auth Context** (30 min)
   - AuthContext provider
   - Auth utilities
   - MetaMask integration

4. **Frontend Login UI** (45 min)
   - Login page
   - MetaMask connection flow
   - Token display

5. **Integration** (30 min)
   - Update API client with headers
   - Route protection
   - Error handling

6. **Testing** (30 min)
   - Manual end-to-end flow
   - Error scenarios
   - Token expiration

**Total Estimated Time**: ~2 hours (simplified MVP)

## Why This MVP is "Best Version"

1. **Clean Architecture**: Follows existing gateway patterns (handlers, services, middleware)
2. **Secure by Default**: EIP-712 signatures are industry standard
3. **Developer-Friendly**: 7-day tokens reduce login friction
4. **Simple but Complete**: All core functionality without over-engineering
5. **Production-Ready**: Can deploy immediately with proper HTTPS
6. **Extensible**: Easy to add nonces, rate limiting, DB storage later
