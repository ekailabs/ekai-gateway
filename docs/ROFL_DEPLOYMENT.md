# ROFL Deployment Guide

Deploy your own private ekai-gateway instance on Oasis Network using ROFL (Runtime Off-chain Logic).

## Why ROFL?

- **Private**: Your API keys stay secure, in a TEE (Trusted Execution Environment)
- **Isolated**: Each user deploys their own instance
- **Verifiable**: Code execution can be verified on-chain

## Live Mainnet Deployment

The gateway runs on **Oasis Sapphire Mainnet** (chainId `23294`). API keys are stored
encrypted in an on-chain `EkaiControlPlane` control plane and decrypted only inside the
attested ROFL enclave.

| Component | Value |
|-----------|-------|
| Network / ParaTime | Sapphire **Mainnet** (`23294`) / sapphire |
| RPC | `https://sapphire.oasis.io` |
| EkaiControlPlane contract | `0x8212Da9695946dc97B89d2F7D2B47E623CE5d87b` ([Sourcify](https://repo.sourcify.dev/contracts/full_match/23294/0x8212Da9695946dc97B89d2F7D2B47E623CE5d87b/)) |
| ROFL app ID (bech32) | `rofl1qz2j0yhj3rza2ye5jcq2r2s52ard4z88fvst39rg` |
| ROFL app ID (bytes21) | `0x00952792f288c5d513349600a1aa145746da88e74b` |

The gateway image is network-agnostic; the network is selected via env in
`docker-compose.yaml`:

```yaml
SAPPHIRE_RPC_URL: https://sapphire.oasis.io
SAPPHIRE_CHAIN_ID: 23294
EKAI_CONTROL_PLANE_ADDRESS: 0x8212Da9695946dc97B89d2F7D2B47E623CE5d87b
```

To target Mainnet, omit `--network testnet` (mainnet is the default) and fund your wallet
with **ROSE** instead of testnet tokens. Everything else below is identical.

## Prerequisites

1. **Oasis CLI** (v0.18.x+)
   ```bash
   curl -fsSL https://get.oasis.io | bash
   oasis --version
   ```

2. **Docker**
   ```bash
   docker --version
   ```

3. **Funded Wallet**
   ```bash
   oasis wallet create my_wallet
   # Get testnet tokens: https://faucet.testnet.oasis.io/
   oasis wallet show my_wallet --network testnet --paratime sapphire
   ```

4. **API Keys** (at least one): OpenAI, Anthropic, or xAI

## Deployment

```bash
# 1. Clone
git clone https://github.com/ekailabs/ekai-gateway.git
cd ekai-gateway

# 2. Initialize the manifest (creates rofl.yaml)
oasis rofl init

# 3. Register app
#    Mainnet (default): oasis rofl create --network mainnet --paratime sapphire
oasis rofl create --network testnet --paratime sapphire

# 4. Build
oasis rofl build

# 5. Update on-chain config
oasis rofl update

# 6. Deploy + rent a machine
oasis rofl deploy

# 7. Get your endpoints
oasis rofl machine show
```

### Loading provider API keys

This deployment stores API keys **encrypted in the on-chain `EkaiControlPlane`
contract**, not as ROFL env secrets. Keys are encrypted to the gateway's X25519
public key so only the attested enclave can decrypt them:

1. Read the running gateway's key: `curl https://<endpoint>/rofl/public-key`
2. Register it on-chain (admin): `npx hardhat ekai-set-rofl-key --address <contract> --pubkey 0x<publicKeyBytes> --network sapphire`
3. Encrypt + store each key via the api-vault dashboard (`encryptSecret`), which
   produces the CBOR `X25519-DeoxysII` envelope the gateway decrypts.

> ⚠️ Do **not** use the `ekai-set-secret` Hardhat task for real keys — it stores
> plaintext bytes and the gateway's decryptor will reject it. It's a localnet demo stub.

Simpler BYOK alternative (no control plane): inject keys as ROFL secrets instead —
`echo -n "sk-..." | oasis rofl secret set OPENAI_API_KEY -` then `oasis rofl update`.

## Your Endpoints

After `oasis rofl machine show`, you'll see:

```
Proxy:
  Domain: m1234.test-proxy-b.rofl.app
  Ports:
    3001: https://p3001.m1234.test-proxy-b.rofl.app  # Gateway API
    3000: https://p3000.m1234.test-proxy-b.rofl.app  # Dashboard
```

## Testing

Replace `m1234` with your actual domain from the output above.

```bash
# Health check
curl https://p3001.m1234.test-proxy-b.rofl.app/health

# List models
curl https://p3001.m1234.test-proxy-b.rofl.app/v1/models

# Chat completion (OpenAI)
curl https://p3001.m1234.test-proxy-b.rofl.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Chat completion (Anthropic)
curl https://p3001.m1234.test-proxy-b.rofl.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Use with OpenAI-Compatible Tools

```bash
export OPENAI_BASE_URL=https://p3001.m1234.test-proxy-b.rofl.app/v1
export OPENAI_API_KEY="not-needed"  # Keys are in TEE
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `oasis rofl show` | View app status |
| `oasis rofl machine show` | View endpoints and machine info |
| `oasis rofl machine logs` | View logs |
| `oasis rofl secret list` | List secrets |

## Troubleshooting

**"app identifier already defined"**: Remove `deployments` section from `rofl.yaml` and run `oasis rofl create` again.

**"forbidden"**: You're using a different wallet than the one that created the app. Check with `oasis wallet list`.

**Build failures**: Ensure Docker is running (`docker ps`) and you have disk space (`df -h`).

**Insufficient funds**: Get testnet tokens from https://faucet.testnet.oasis.io/

## Resources

- [Oasis ROFL Docs](https://docs.oasis.io/rofl/)
- [Oasis CLI Reference](https://docs.oasis.io/cli/)
- [Testnet Faucet](https://faucet.testnet.oasis.io/)
