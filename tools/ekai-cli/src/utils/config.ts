import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';

const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CLI_CONFIG_DIR = path.join(os.homedir(), '.ekai');
const CLI_CONFIG_PATH = path.join(CLI_CONFIG_DIR, 'config.json');

export interface CliConfig {
  gatewayUrl?: string;
  port?: string;
  env?: Record<string, string>;
  workspacePath?: string;
}

export function loadCliConfig(): CliConfig {
  if (!fs.existsSync(CLI_CONFIG_PATH)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(CLI_CONFIG_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      return data as CliConfig;
    }
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    if (errorMsg.includes('ENOENT')) {
      // File doesn't exist - this is fine
      return {};
    }
    // Parse error or permission issue - warn but continue
    console.warn(`[ekai-cli] Warning: Unable to parse config.json at ${CLI_CONFIG_PATH}: ${errorMsg}`);
  }

  return {};
}

function workspaceLooksValid(dir?: string | null): dir is string {
  if (!dir) return false;
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg?.name === 'ekai-gateway';
  } catch {
    return false;
  }
}

export function resolveWorkspaceRoot(config?: CliConfig): string | null {
  const cliConfig = config ?? loadCliConfig();
  const candidates = [
    cliConfig.workspacePath,
    process.env.EKAI_WORKSPACE,
    DEFAULT_PROJECT_ROOT,
  ];

  for (const candidate of candidates) {
    if (workspaceLooksValid(candidate)) {
      return path.resolve(candidate);
    }
  }

  return null;
}

export function loadEnv(config?: CliConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const cliConfig = config ?? loadCliConfig();

  Object.assign(env, process.env);

  if (cliConfig.env) {
    Object.assign(env, cliConfig.env);
  }

  const workspaceRoot = resolveWorkspaceRoot(cliConfig);
  if (workspaceRoot) {
    const envPath = path.join(workspaceRoot, '.env');
    if (fs.existsSync(envPath)) {
      const parsed = dotenv.parse(fs.readFileSync(envPath));
      Object.assign(env, parsed);
    }
  }

  return env;
}

export function getGatewayUrl(env: Record<string, string>, config?: CliConfig): string {
  const cliConfig = config ?? loadCliConfig();

  if (env.EKAI_GATEWAY_URL) {
    return env.EKAI_GATEWAY_URL;
  }

  if (cliConfig.gatewayUrl) {
    return cliConfig.gatewayUrl;
  }

  const port = env.PORT || cliConfig.port || '3001';
  return `http://localhost:${port}`;
}
