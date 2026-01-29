# MetaMask Web3 Authentication - Quick Start Guide

## Prerequisites
- MetaMask browser extension installed
- Node.js and npm installed
- Two terminal windows

## Installation & Setup

### 1. Install Dependencies (if not already installed)

```bash
# Gateway dependencies
cd gateway
npm install
cd ..

# Dashboard dependencies
cd ui/dashboard
npm install
cd ../..
```

## Running the Application

### Terminal 1: Start Gateway
```bash
cd gateway
npm run dev
# Gateway will start on http://localhost:3001
```

### Terminal 2: Start Dashboard
```bash
cd ui/dashboard
npm run dev
# Dashboard will start on http://localhost:3000
```

## Using the Authentication System

### Step 1: Navigate to Login Page
Open your browser and go to:
```
http://localhost:3000/login
```

### Step 2: Connect MetaMask
1. Click "Connect MetaMask" button
2. MetaMask popup will appear
3. Select your wallet account
4. Click "Next" → "Connect"

**Expected result:** Your wallet address appears in a green success box

### Step 3: Sign EIP-712 Message
1. Click "Sign to Login" button
2. MetaMask signature request appears
3. Review the message details (should show "Ekai Gateway" and your address)
4. Click "Sign"

**Expected result:** Token is displayed with export commands and success message

### Step 4: Use Token with Claude Code

Copy the export commands from the login page:
```bash
export ANTHROPIC_BASE_URL=http://localhost:3001
export ANTHROPIC_API_KEY=<your-token-here>
```

Use in terminal:
```bash
# Paste the export commands
export ANTHROPIC_BASE_URL=http://localhost:3001
export ANTHROPIC_API_KEY=abc123...

# Test with claude-code
claude-code "What time is it?"
```

### Step 5: Access Dashboard
After login, you'll be automatically redirected to the dashboard at:
```
http://localhost:3000
```

Or click "Go to Dashboard" button

## Verify It's Working

### Check Gateway Logs
In the gateway terminal, you should see:
```
User authenticated via EIP-712 signature
{
  address: "0x...",
  expiresIn: 604800,
  requestId: "...",
  module: "auth-handler"
}
```

### Check Dashboard
The dashboard should:
- Display usage data
- Show models list (with auth header)
- Allow budget management
- Not show any 401 errors in console

### Check Network Requests
Open browser DevTools (F12) → Network tab:
- Login request to `POST /auth/login` should return 200 with token
- Dashboard requests should have `Authorization: Bearer <token>` header
- All `/v1/*` requests should succeed with 200

## Token Information

### Token Properties
- **Format:** 32-byte hexadecimal string (64 characters)
- **TTL (Time to Live):** 7 days (604800 seconds)
- **Storage:** Browser localStorage (survives page reload)
- **Expiration:** Timestamp when token becomes invalid
- **Chain:** Works offline, no blockchain required

### Token Lifespan
- **Created:** When you successfully sign the message
- **Stored:** In browser localStorage until expiration
- **Used:** Include in `Authorization: Bearer <token>` header for all API requests
- **Expires:** After 7 days, must login again

## Common Tasks

### Copy Export Commands
1. After successful login
2. Look for "Export Commands for Claude Code" section
3. Click copy button (top right of command box)
4. Paste in your terminal

### Copy Just the Token
1. After successful login
2. Look for "Your API Token" section
3. Click copy button (top right of token box)
4. Use in your application

### Logout
In dashboard:
1. The token is stored in localStorage
2. To logout, clear localStorage or restart browser
3. You'll be redirected to login page on next visit

### Test Token Expiration
After successful login:
1. Open browser DevTools Console
2. Run: `localStorage.removeItem('ekai_auth_token')`
3. Refresh page → You'll be redirected to login
4. Try accessing dashboard → Get 401 Unauthorized

## Troubleshooting

### "MetaMask is not installed" Error
- Install MetaMask: https://metamask.io
- Reload the page after installation

### "User rejected MetaMask connection" Error
- Click "Connect MetaMask" again
- Check MetaMask extension for notification
- Approve the connection request

### "User rejected message signing" Error
- Click "Sign to Login" again
- Approve the signature request in MetaMask
- Review the message details before signing

### "Failed to connect wallet" Error
- Check that MetaMask is unlocked
- Try disconnecting from the site in MetaMask settings
- Restart your browser

### 401 Unauthorized in Dashboard
- Token may have expired → Login again
- Token not being sent → Check browser DevTools Network tab
- Check that Authorization header is present

### Gateway Returns Error
- Check gateway logs in terminal for error details
- Verify `AUTH_TOKEN_TTL` and `AUTH_MAX_MESSAGE_AGE` in `.env`
- Ensure signature verification completed

### CORS or Network Errors
- Verify gateway is running on http://localhost:3001
- Check `NEXT_PUBLIC_API_BASE_URL` in ui/dashboard/.env.local
- Ensure both servers are started

## Environment Configuration

### Gateway Configuration
File: `gateway/.env`
```bash
AUTH_TOKEN_TTL=604800           # 7 days (adjust if needed)
AUTH_MAX_MESSAGE_AGE=300        # 5 minutes (adjust if needed)
SERVER_PORT=3001
SERVER_ENVIRONMENT=development
```

### Dashboard Configuration
File: `ui/dashboard/.env.local`
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

## API Endpoints

### Public Endpoints (No Auth Required)
```
GET  /health                    # Health check
POST /auth/login                # Authentication with signature
GET  /config/status             # Gateway configuration status
```

### Protected Endpoints (Auth Required)
All require `Authorization: Bearer <token>` header:
```
POST /v1/chat/completions       # OpenAI format chat
POST /v1/messages               # Anthropic format messages
POST /v1/responses              # OpenAI format responses
GET  /v1/models                 # List available models
GET  /usage                      # Get usage statistics
GET  /budget                     # Get budget limits
PUT  /budget                     # Update budget limits
```

## Performance Tips

- **First login:** May take 2-3 seconds for signature verification
- **Subsequent requests:** Should be <100ms (in-memory token lookup)
- **Token cleanup:** Runs every 5 minutes in background

## Security Notes

- Tokens are stored in localStorage (HTTP-only cookies recommended for production)
- EIP-712 messages include expiration to prevent replay
- Each signature is unique (uses current timestamp)
- No private keys or mnemonics transmitted
- Backend validates all signatures before issuing tokens

## Next Steps

After successful authentication:

1. **Explore Dashboard:** View usage analytics and model catalogs
2. **Set Budget:** Configure spending limits if needed
3. **Use Claude Code:** Execute commands with your EKAI_TOKEN
4. **Monitor Usage:** Track API consumption and costs

## Getting Help

Check the implementation summary for:
- Architecture details
- File structure
- Advanced configuration
- Future enhancement ideas

See `IMPLEMENTATION_SUMMARY.md` for complete documentation.
