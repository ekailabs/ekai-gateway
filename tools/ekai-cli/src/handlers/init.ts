import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { c, symbols } from '../utils/colors';
import { prompt, promptMasked } from '../utils/ui';

export async function handleInit(args: any) {
  console.log(`\n${symbols.arrow} ${c.bright}Ekai Initialization${c.reset}\n`);

  const configDir = path.join(os.homedir(), '.ekai');
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
      console.log(`${c.green}Created config directory: ${configDir}${c.reset}`);
    } catch (err) {
      console.error(`${symbols.cross} ${c.red}Failed to create config directory: ${err}${c.reset}`);
      process.exit(1);
    }
  } else {
    // Ensure existing directory has correct permissions (Unix-like only)
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(configDir, 0o700);
      } catch (err) {
        // Ignore permission errors - might not be owner
      }
    }
  }

  const envPath = path.join(configDir, '.env');
  let currentEnv: Record<string, string> = {};

  if (fs.existsSync(envPath)) {
    console.log(`${symbols.info} Found existing configuration at ${envPath}`);
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const parsed = dotenv.parse(content);
      currentEnv = parsed;
    } catch (err) {
      console.warn(`${c.yellow}Warning: Failed to parse existing .env file: ${err}${c.reset}`);
    }
    
    // Ensure file has restrictive permissions (Unix-like only)
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(envPath, 0o600);
      } catch (err) {
        // Ignore permission errors - might not be owner
      }
    }
  } else {
    console.log(`${symbols.info} Creating new configuration file at ${envPath}`);
  }

  const providers = [
    { name: 'Anthropic', key: 'ANTHROPIC_API_KEY', hint: 'sk-ant-...' },
    { name: 'OpenAI', key: 'OPENAI_API_KEY', hint: 'sk-...' },
    { name: 'Google Gemini', key: 'GEMINI_API_KEY', hint: '' },
    { name: 'xAI', key: 'XAI_API_KEY', hint: '' },
    { name: 'OpenRouter', key: 'OPENROUTER_API_KEY', hint: 'sk-or-...' },
  ];

  const newEnv = { ...currentEnv };
  let updated = false;
  let hasKeys = false;

  console.log(`\nPlease enter your API keys (leave empty to skip/keep existing):`);
  console.log(`${c.dim}Keys will be masked as you type for security.${c.reset}\n`);

  for (const p of providers) {
    const existing = currentEnv[p.key];
    const status = existing ? ` ${c.dim}(configured)${c.reset}` : '';
    const hint = p.hint ? ` ${c.dim}(${p.hint})${c.reset}` : '';
    
    // Use masked prompt for security
    const val = await promptMasked(`${c.cyan}?${c.reset} ${p.name} API Key${status}${hint}: `);
    
    if (val.trim()) {
      // Basic validation - warn if key seems too short
      if (val.trim().length < 10) {
        console.log(`${c.yellow}⚠ Warning: Key seems unusually short. Please verify.${c.reset}`);
      }
      newEnv[p.key] = val.trim();
      updated = true;
    } else if (existing) {
      // Keep existing value if user skipped
      newEnv[p.key] = existing;
    }
    
    if (newEnv[p.key]) hasKeys = true;
  }

  if (!hasKeys) {
    console.log(`\n${c.yellow}${symbols.warning} No API keys configured. The gateway might not work correctly without at least one provider.${c.reset}`);
  }

  // Write back
  if (updated || !fs.existsSync(envPath)) {
    const envContent = Object.entries(newEnv)
      .map(([k, v]) => {
        // Escape values that contain spaces or special characters
        if (v.includes(' ') || v.includes('=') || v.includes('#')) {
          return `${k}="${v.replace(/"/g, '\\"')}"`;
        }
        return `${k}=${v}`;
      })
      .join('\n');
    
    try {
      // Write with restrictive permissions
      const fd = fs.openSync(envPath, 'w', 0o600);
      fs.writeFileSync(fd, envContent, 'utf8');
      fs.closeSync(fd);
      
      // On Unix-like systems, ensure permissions are correct
      if (process.platform !== 'win32') {
        fs.chmodSync(envPath, 0o600);
      }
      
      console.log(`\n${symbols.check} ${c.green}Configuration saved securely to ${envPath}${c.reset}`);
      console.log(`${c.dim}   File permissions: 600 (owner read/write only)${c.reset}`);
    } catch (err) {
      console.error(`\n${symbols.cross} ${c.red}Failed to save configuration: ${err}${c.reset}`);
      process.exit(1);
    }
  } else {
    console.log(`\n${c.dim}No changes made.${c.reset}`);
  }
  
  console.log(`\nAll set! You can now run ${c.green}ekai up${c.reset} to start the gateway.`);
  
  // clear hint about docker
  console.log(`${c.dim}(Run from any folder - we'll handle the Docker magic if needed)${c.reset}`);
}

