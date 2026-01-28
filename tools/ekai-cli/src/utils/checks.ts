import * as http from 'http';
import { spawnSync } from 'child_process';
import { c, symbols } from './colors';

const MIN_VERSIONS: Record<string, string> = {
  claude: '2.0.0',
  codex: '0.63.0'
};

interface GatewayConfig {
  mode: 'x402-only' | 'hybrid' | 'byok';
  x402Enabled: boolean;
  providers: Record<string, boolean>;
}

export function checkGateway(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(url, (res) => {
      resolve(true);
      req.destroy();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function getGatewayConfig(url: string): Promise<GatewayConfig | null> {
  return new Promise(resolve => {
    const req = http.get(`${url}/config/status`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

export function checkKey(provider: string, env: Record<string, string>): boolean {
  const map: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    xai: 'XAI_API_KEY',
    zai: 'ZAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY'
  };
  const key = map[provider];
  return !!(key && env[key]);
}

export function checkVersion(tool: string): void {
  const min = MIN_VERSIONS[tool];
  if (!min) return;
  
  const res = spawnSync(tool, ['--version'], { encoding: 'utf8' });
  if (res.error) {
    console.log(`${symbols.cross} ${c.red}${tool} not found.${c.reset}`);
    console.log(`  Please install it first to use this integration.`);
    process.exit(1);
  }
  
  const versionMatch = res.stdout.match(/(\d+\.\d+\.\d+)/);
  if (versionMatch) {
    const curr = versionMatch[1];
    if (!isGte(curr, min)) {
      console.log(`${symbols.cross} ${c.red}${tool} version ${curr} is too old.${c.reset}`);
      console.log(`  Required: >= ${min}`);
      console.log(`  Run with --skip-version-check to force.`);
      process.exit(1);
    }
  }
}

function isGte(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i]||0) > (pb[i]||0)) return true;
    if ((pa[i]||0) < (pb[i]||0)) return false;
  }
  return true;
}

