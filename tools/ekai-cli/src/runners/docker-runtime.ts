import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { c, symbols } from '../utils/colors';
import type { CliConfig } from '../utils/config';

const DEFAULT_IMAGE = 'ghcr.io/ekailabs/ekai-gateway:latest';

interface Args {
  flags: Record<string, any>;
  positionals: string[];
}

export async function runDockerRuntime(args: Args, cliConfig: CliConfig): Promise<void> {
  const dockerOk = await dockerAvailable();
  if (!dockerOk) {
    console.error(`\n${symbols.cross} ${c.red}Docker is required when no workspace is available.${c.reset}`);
    console.error(`   ${c.dim}Install Docker Desktop or the Docker Engine, then re-run \`ekai up\`.${c.reset}\n`);
    process.exit(1);
  }

  const image = resolveImage(args, cliConfig);
  const gatewayPort = resolveGatewayPort(args, cliConfig);
  const uiPort = resolveUiPort(args, cliConfig);
  const apiBaseUrl = resolveApiBaseUrl(args, gatewayPort);
  const envFile = resolveEnvFile(args);
  const runtimePaths = ensureRuntimeDirs();

  console.log(`\n${symbols.arrow} ${c.bright}Falling back to Docker runtime${c.reset}`);
  console.log(`${c.dim}   image: ${image}${c.reset}`);
  console.log(`${c.dim}   ports: ${gatewayPort}->3001, ${uiPort}->3000${c.reset}`);
  if (envFile) {
    console.log(`${c.dim}   env:   ${envFile}${c.reset}`);
  } else {
    console.log(`${symbols.info} ${c.yellow}No .env file detected; API keys must be provided via env vars or docker secrets.${c.reset}`);
    console.log(`   ${c.dim}Create one at ~/.ekai/.env or pass --env-file <path>.${c.reset}`);
  }

  if (!args.flags['skip-pull']) {
    const hasImage = await dockerImageExists(image);
    if (!hasImage) {
      await dockerPull(image);
    }
  }

  await runContainer({
    image,
    gatewayPort,
    uiPort,
    envFile,
    apiBaseUrl,
    dataDir: runtimePaths.dataDir,
    logsDir: runtimePaths.logsDir,
  });
}

async function dockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['version'], { stdio: 'ignore' });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function dockerImageExists(image: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['image', 'inspect', image], { stdio: 'ignore' });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function dockerPull(image: string): Promise<void> {
  console.log(`${symbols.arrow} ${c.dim}Pulling ${image}...${c.reset}`);
  await runCommand('docker', ['pull', image]);
}

async function runContainer(options: {
  image: string;
  gatewayPort: string;
  uiPort: string;
  envFile: string | null;
  apiBaseUrl: string;
  dataDir: string;
  logsDir: string;
}): Promise<void> {
  const containerName = `ekai-gateway-${Date.now()}`;
  const args = [
    'run',
    '--rm',
    '--name',
    containerName,
    '-p',
    `${options.gatewayPort}:3001`,
    '-p',
    `${options.uiPort}:3000`,
    '-v',
    `${options.dataDir}:/app/gateway/data`,
    '-v',
    `${options.logsDir}:/app/gateway/logs`,
    '-e',
    `PORT=${options.gatewayPort}`,
    '-e',
    `UI_PORT=${options.uiPort}`,
    '-e',
    `NEXT_PUBLIC_API_BASE_URL=${options.apiBaseUrl}`,
  ];

  if (options.envFile) {
    args.push('--env-file', options.envFile);
  }

  args.push(options.image);

  console.log(`${symbols.arrow} ${c.bright}Running container${c.reset}`);
  const child = spawn('docker', args, { stdio: 'inherit' });

  const stop = (signal: NodeJS.Signals) => {
    console.log(`\n${c.dim}↪ Stopping Docker container (${signal})…${c.reset}`);
    child.kill(signal);
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker run exited with code ${code}`));
      }
    });
    child.on('error', (err) => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      reject(err);
    });
  });
}

function resolveImage(args: Args, config: CliConfig): string {
  return (
    args.flags.image ||
    process.env.EKAI_DOCKER_IMAGE ||
    config.containerImage ||
    DEFAULT_IMAGE
  );
}

function resolveGatewayPort(args: Args, config: CliConfig): string {
  const fromFlag = args.flags.port || args.flags.p;
  const value = fromFlag || process.env.PORT || config.port || '3001';
  return String(value);
}

function resolveUiPort(args: Args, config: CliConfig): string {
  const value = args.flags['ui-port'] || args.flags.uiPort || process.env.UI_PORT || config.uiPort || '3000';
  return String(value);
}

function resolveApiBaseUrl(args: Args, gatewayPort: string): string {
  const fromFlag = args.flags['api-base-url'] || args.flags.apiBaseUrl;
  const env = process.env.NEXT_PUBLIC_API_BASE_URL;
  return String(fromFlag || env || `http://localhost:${gatewayPort}`);
}

function resolveEnvFile(args: Args): string | null {
  const candidates = [
    args.flags['env-file'],
    args.flags.env,
    process.env.EKAI_ENV_FILE,
    path.join(process.cwd(), '.env'),
    path.join(os.homedir(), '.ekai', '.env'),
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string') {
      const resolved = path.resolve(candidate);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

function ensureRuntimeDirs(): { dataDir: string; logsDir: string } {
  const runtimeRoot = path.join(os.homedir(), '.ekai', 'runtime');
  const dataDir = path.join(runtimeRoot, 'gateway-data');
  const logsDir = path.join(runtimeRoot, 'gateway-logs');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  return { dataDir, logsDir };
}

async function runCommand(cmd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
      }
    });
    child.on('error', (err) => reject(err));
  });
}
