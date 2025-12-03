import { loadEnv, getGatewayUrl, loadCliConfig } from '../utils/config';
import { c, symbols } from '../utils/colors';
import { checkGateway, checkVersion, checkKey, getGatewayConfig } from '../utils/checks';
import { selectModelInteractive, prompt } from '../utils/ui';
import { inferProvider } from '../utils/catalog';
import { writeCodexConfig, setCodexModelProvider } from '../utils/codex-config';
import { spawn } from 'child_process';

export async function handleTool(toolName: string, args: any) {
  const cliConfig = loadCliConfig();
  const env = loadEnv(cliConfig);
  const gatewayUrl = getGatewayUrl(env, cliConfig);
  
  const title = `Ekai ${toolName.charAt(0).toUpperCase() + toolName.slice(1)} Launcher`;
  const line = '─'.repeat(title.length);
  
  console.log(`\n${c.bright}${title}${c.reset}`);
  console.log(`${c.dim}${line}${c.reset}`);

  // 1. Check Gateway Connectivity
  const isGatewayUp = await checkGateway(gatewayUrl);
  if (!isGatewayUp) {
    console.log(`\n${symbols.cross} ${c.red}Gateway unreachable at ${gatewayUrl}${c.reset}`);
    console.log(`   ${c.dim}Start it in a separate terminal:${c.reset}`);
    console.log(`   ${c.bright}$ ekai up${c.reset}`);
    console.log(`   ${c.dim}...or run ${c.bright}npm run dev${c.reset} if you prefer the raw scripts.${c.reset}\n`);
    process.exit(1);
  }

  // 2. Verify Version
  if (!args.flags['skip-version-check']) {
    checkVersion(toolName);
  }

  // 3. Select Model
  let model = args.flags.model || args.flags.m; // Support both --model and -m
  if (!model) {
    console.log(); // spacer
    model = await selectModelInteractive(toolName);
    console.log(); // spacer
  }
  
  const provider = inferProvider(model);
  console.log(`${symbols.check} ${c.bright}${model}${c.reset} ${c.dim}(${provider})${c.reset}`);

  // 4. Check Keys (with hybrid mode awareness)
  const hasKey = checkKey(provider, env);
  if (!hasKey) {
    // Check if gateway is in hybrid mode
    const gatewayConfig = await getGatewayConfig(gatewayUrl);
    const isHybrid = gatewayConfig?.mode === 'hybrid' || gatewayConfig?.mode === 'x402-only';
    
    if (isHybrid && gatewayConfig?.x402Enabled) {
      console.log(`\n${symbols.info} Missing ${c.yellow}${provider}${c.reset} key, will use x402 payment as fallback\n`);
    } else {
      console.log(`\n${symbols.cross} Missing API key for ${c.yellow}${provider}${c.reset} in .env`);
      const confirm = await prompt(`${c.yellow}Continue anyway? (y/N) ${c.reset}`);
      if (confirm.toLowerCase() !== 'y') process.exit(1);
    }
  }

  // 5. Prepare Env & Config
  const toolEnv = { ...process.env };
  let baseUrl = gatewayUrl;

  if (toolName === 'claude') {
    toolEnv.ANTHROPIC_BASE_URL = baseUrl;
    toolEnv.ANTHROPIC_MODEL = model;
  } else if (toolName === 'codex') {
    baseUrl = `${gatewayUrl}/v1`;
    // Write to config.toml (recommended approach)
    // writeCodexConfig will also call setCodexModelProvider internally
    try {
      writeCodexConfig(baseUrl);
    } catch (err: any) {
      console.error(`\n${symbols.cross} ${c.red}${err.message}${c.reset}\n`);
      process.exit(1);
    }
    // Also set env vars as fallback
    toolEnv.OPENAI_BASE_URL = baseUrl;
    if (model) toolEnv.CODEX_MODEL = model;
  }

  // 6. Launch
  console.log(`${symbols.arrow} Proxying to ${c.dim}${baseUrl}${c.reset}`);
  console.log(`${c.dim}   (Ctrl+C to exit)${c.reset}\n`);

  // Build command arguments
  const spawnArgs: string[] = [];
  if (toolName === 'codex' && model) {
    spawnArgs.push('--model', model);
  }

  const child = spawn(toolName, spawnArgs, {
    stdio: 'inherit',
    env: toolEnv
  });

  const handleSignal = (signal: NodeJS.Signals) => {
    console.log(`\n${c.dim}↪ Stopping ${toolName} (${signal})…${c.reset}`);
    child.kill(signal);
  };

  const onSigint = () => handleSignal('SIGINT');
  const onSigterm = () => handleSignal('SIGTERM');

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  // Handle spawn errors (e.g., tool not found)
  child.on('error', (err: NodeJS.ErrnoException) => {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    if (err.code === 'ENOENT') {
      console.error(`\n${symbols.cross} ${c.red}${toolName} not found in PATH${c.reset}`);
      console.error(`   ${c.dim}Please install ${toolName} first:${c.reset}`);
      if (toolName === 'claude') {
        console.error(`   ${c.bright}$ npm install -g @anthropic-ai/claude-cli${c.reset}\n`);
      } else if (toolName === 'codex') {
        console.error(`   ${c.bright}$ npm install -g @cursor/codex-cli${c.reset}\n`);
      }
    } else {
      console.error(`\n${symbols.cross} ${c.red}Failed to launch ${toolName}: ${err.message}${c.reset}\n`);
    }
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    console.log(`\n${c.dim}─ ${toolName} finished (code ${code}) ─${c.reset}`);
    process.exit(code ?? 0);
  });
}
