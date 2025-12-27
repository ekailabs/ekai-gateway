import { loadEnv } from '../utils/config';
import { c } from '../utils/colors';
import { checkKey } from '../utils/checks';
import { getCompatibleModels, inferProvider } from '../utils/catalog';

export async function handleModels(args: any) {
  const env = loadEnv();
  const providerFilter = args.flags.provider;
  
  // Show both catalogs
  console.log(`\n${c.bright}Available Models${c.reset}`);
  console.log(`${c.dim}----------------${c.reset}\n`);

  // Claude-compatible models (messages API)
  const claudeModels = getCompatibleModels('claude');
  if (claudeModels.length > 0) {
    console.log(`${c.cyan}Claude-compatible (messages API):${c.reset}`);
    let count = 0;
    for (const m of claudeModels) {
      const p = inferProvider(m);
      if (providerFilter && p !== providerFilter) continue;
      const hasKey = checkKey(p, env);
      const status = hasKey ? c.green : c.dim;
      const keyMark = hasKey ? '' : ' (no key)';
      console.log(`  ${status}${m.padEnd(30)}${c.reset} ${c.dim}[${p}]${keyMark}${c.reset}`);
      count++;
      if (count >= 15 && !args.flags.all) break;
    }
    if (claudeModels.length > 15 && !args.flags.all) {
      console.log(`  ${c.dim}...and ${claudeModels.length - 15} more (use --all to see all)${c.reset}`);
    }
    console.log();
  }

  // Codex-compatible models (chat completions API)
  const codexModels = getCompatibleModels('codex');
  if (codexModels.length > 0) {
    console.log(`${c.cyan}Codex-compatible (chat completions API):${c.reset}`);
    let count = 0;
    for (const m of codexModels) {
      const p = inferProvider(m);
      if (providerFilter && p !== providerFilter) continue;
      const hasKey = checkKey(p, env);
      const status = hasKey ? c.green : c.dim;
      const keyMark = hasKey ? '' : ' (no key)';
      console.log(`  ${status}${m.padEnd(30)}${c.reset} ${c.dim}[${p}]${keyMark}${c.reset}`);
      count++;
      if (count >= 15 && !args.flags.all) break;
    }
    if (codexModels.length > 15 && !args.flags.all) {
      console.log(`  ${c.dim}...and ${codexModels.length - 15} more (use --all to see all)${c.reset}`);
    }
  }
}

