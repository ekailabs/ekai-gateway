// One-shot verification: login as delegate, set prefs to owner, send ONE request.
// Triggers EkaiControlPlane.logReceipt so we can confirm a ReceiptLogged event on-chain.
// Usage: node gateway/verify-receipt.mjs   (needs the delegate private key)
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';

const BASE = process.env.BASE || 'https://p3001.m267.opf-mainnet-rofl-35.rofl.app';
const DELEGATE_KEY_FILE = process.env.DELEGATE_KEY_FILE || '/tmp/delegate-key';
const SECRET_OWNER = process.env.SECRET_OWNER || '0x4Ec6E3b99E2E4422d6e64313F5AA2A8470DCDa2b';
const MODEL = process.env.MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';

const pk = fs.readFileSync(DELEGATE_KEY_FILE, 'utf8').trim();
const acct = privateKeyToAccount(pk.startsWith('0x') ? pk : '0x' + pk);
console.log('delegate:', acct.address, '| owner:', SECRET_OWNER);

const expiration = Math.floor(Date.now() / 1000) + 604800;
const signature = await acct.signTypedData({
  domain: { name: 'Ekai Gateway', version: '1', chainId: 23294 },
  types: { Login: [{ name: 'address', type: 'address' }, { name: 'expiration', type: 'uint256' }] },
  primaryType: 'Login',
  message: { address: acct.address, expiration: BigInt(expiration) },
});
let r = await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: acct.address, expiration, signature }),
});
if (!r.ok) throw new Error(`login ${r.status}: ${(await r.text()).slice(0, 200)}`);
const token = (await r.json()).token;
console.log('logged in, token acquired');

r = await fetch(`${BASE}/user/preferences`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ api_address: SECRET_OWNER, model_preferences: [MODEL] }),
});
if (!r.ok) throw new Error(`prefs ${r.status}: ${(await r.text()).slice(0, 250)}`);
console.log('prefs set (api_address = owner)');

r = await fetch(`${BASE}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'Say hi in 3 words.' }], max_tokens: 50 }),
});
const body = await r.text();
console.log('chat status:', r.status);
console.log('chat body:', body.slice(0, 400));
try {
  const j = JSON.parse(body);
  console.log('usage:', JSON.stringify(j.usage));
} catch {}
