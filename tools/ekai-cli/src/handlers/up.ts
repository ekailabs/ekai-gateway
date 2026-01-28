import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { c, symbols } from '../utils/colors';
import { CliConfig, loadCliConfig, loadEnv } from '../utils/config';
import { runDockerRuntime } from '../runners/docker-runtime';

const DEFAULT_WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');

type Surface = 'all' | 'gateway' | 'ui';

interface WorkspaceResolution {
  path: string | null;
  reason?: string;
}

export async function handleUp(args: any) {
  const cliConfig = loadCliConfig();
  const workspaceInfo = resolveWorkspace(args, cliConfig);
  const runtimePreference = typeof args.flags.runtime === 'string' ? args.flags.runtime.toLowerCase() : null;

  if (runtimePreference === 'docker') {
    await runDockerRuntime(args, cliConfig);
    return;
  }

  if (!workspaceInfo.path) {
    if (runtimePreference === 'local') {
      console.error(`\n${symbols.cross} ${c.red}Unable to locate ekai-gateway workspace${c.reset}`);
      if (workspaceInfo.reason) {
        console.error(`   ${c.dim}${workspaceInfo.reason}${c.reset}`);
      }
      console.error(`\nProvide a workspace path via ${c.yellow}--workspace <path>${c.reset}, set ${c.yellow}EKAI_WORKSPACE${c.reset}, or add { "workspacePath": "/path/to/ekai-gateway" } to ~/.ekai/config.json.`);
      process.exit(1);
    }

    await runDockerRuntime(args, cliConfig);
    return;
  }

  const surface = getSurface(args);
  const mode = (args.flags.mode === 'prod' || args.flags.mode === 'start') ? 'start' : 'dev';
  const script = getScript(surface, mode);
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  console.log(`\n${symbols.arrow} ${c.bright}Starting Ekai ${surfaceLabel(surface)} (${mode})${c.reset}`);
  console.log(`${c.dim}   workspace: ${workspaceInfo.path}${c.reset}`);
  console.log(`${c.dim}   running: npm run ${script}${c.reset}\n`);

  const envVars = loadEnv(cliConfig);

  const child = spawn(npmCmd, ['run', script], {
    cwd: workspaceInfo.path,
    stdio: 'inherit',
    env: envVars,
  });

  const handleSignal = (signal: NodeJS.Signals) => {
    console.log(`\n${c.dim}↪ Stopping ekai up (${signal})…${c.reset}`);
    child.kill(signal);
  };

  const onSigint = () => handleSignal('SIGINT');
  const onSigterm = () => handleSignal('SIGTERM');

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  child.on('exit', (code) => {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    console.log(`\n${c.dim}─ ekai up finished (code ${code}) ─${c.reset}`);
    process.exit(code ?? 0);
  });
}

function resolveWorkspace(args: any, cliConfig: CliConfig): WorkspaceResolution {
  const flagPath = args.flags.workspace || args.flags.w;
  const envPath = process.env.EKAI_WORKSPACE;
  const candidates = [flagPath, envPath, cliConfig.workspacePath, DEFAULT_WORKSPACE];

  for (const candidate of candidates) {
    if (candidate && workspaceLooksValid(candidate)) {
      return { path: path.resolve(candidate) };
    }
  }

  return {
    path: null,
    reason: 'No valid package.json found in expected locations.',
  };
}

function workspaceLooksValid(dir: string): boolean {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return Boolean(pkg?.name === 'ekai-gateway');
  } catch (err) {
    return false;
  }
}

function getSurface(args: any): Surface {
  if (args.flags['gateway-only']) return 'gateway';
  if (args.flags['ui-only']) return 'ui';
  return 'all';
}

function getScript(surface: Surface, mode: 'dev' | 'start'): string {
  if (mode === 'start') {
    if (surface === 'gateway') return 'start:gateway';
    if (surface === 'ui') return 'start:ui';
    return 'start';
  }

  if (surface === 'gateway') return 'dev:gateway';
  if (surface === 'ui') return 'dev:ui';
  return 'dev';
}

function surfaceLabel(surface: Surface): string {
  if (surface === 'gateway') return 'Gateway';
  if (surface === 'ui') return 'Dashboard';
  return 'Gateway + Dashboard';
}
