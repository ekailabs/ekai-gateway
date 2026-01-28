#!/usr/bin/env node
/**
 * ekai-cli: The smooth, clean launcher for AI integrations.
 */
import { c, symbols } from './utils/colors';
import { handleTool } from './handlers/tool';
import { handleModels } from './handlers/models';
import { handleUp } from './handlers/up';
import { handleInit } from './handlers/init';

// --- Main ---

(async () => {
  try {
    await main();
  } catch (err) {
    console.error(`\n${symbols.cross} Error: ${(err as Error).message || err}`);
    process.exit(1);
  }
})();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positionals[0];

  if (!command || args.flags.help || args.flags.h) {
    printHelp();
    return;
  }

  if (command === 'models') {
    await handleModels(args);
    return;
  }

  if (['up', 'serve', 'start'].includes(command)) {
    await handleUp(args);
    return;
  }

  if (command === 'init') {
    await handleInit(args);
    return;
  }

  if (['claude', 'codex'].includes(command)) {
    await handleTool(command, args);
    return;
  }

  console.error(`${symbols.cross} Unknown command: ${command}`);
  printHelp();
}

function parseArgs(args: string[]) {
  const out: { flags: Record<string, any>, positionals: string[] } = { flags: {}, positionals: [] };
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token.startsWith('--')) {
      const [key, val] = token.slice(2).split('=');
      out.flags[key] = val || args[i + 1] || true;
      if (!val && args[i + 1] && !args[i + 1].startsWith('-')) i++;
    } else if (token.startsWith('-')) {
      const key = token.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else {
      out.positionals.push(token);
    }
  }
  return out;
}

function printHelp() {
  console.log(`
${c.bright}ekai-cli${c.reset} - Local AI Gateway Launcher

${c.yellow}Commands:${c.reset}
  ${c.green}ekai init${c.reset}             Initialize configuration and API keys
  ${c.green}ekai claude${c.reset} [options]   Proxy Claude CLI through Ekai
  ${c.green}ekai codex${c.reset}  [options]   Proxy Codex CLI through Ekai
  ${c.green}ekai up${c.reset}      [options]   Start the gateway + dashboard (dev or prod)
  ${c.green}ekai models${c.reset}             List compatible models and key status

${c.yellow}Options:${c.reset}
  --model <name>, -m      Specify model (interactive selector if omitted)
  --skip-version-check    Skip Claude/Codex binary version validation
  --workspace <path>      Override workspace when running ${c.green}ekai up${c.reset}
  --runtime <local|docker>Force ${c.green}ekai up${c.reset} to use a workspace or the Docker runtime
  --image <name>          Override Docker image (default ghcr.io/ekailabs/ekai-gateway:latest)
  --env-file <path>       Provide env vars when using Docker (defaults to ~/.ekai/.env)
  --port <number>         Gateway port mapping (default 3001)
  --ui-port <number>      Dashboard port mapping (default 3000)
  --skip-pull             Skip docker pull (use cached image)
  --help, -h              Show this help

${c.yellow}Examples:${c.reset}
  $ ekai up
  $ ekai claude --model claude-sonnet-4-5
  $ ekai codex --model gpt-4o-mini
  $ ekai models --provider anthropic
`);
}

