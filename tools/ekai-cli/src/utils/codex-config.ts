import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { c, symbols } from './colors';

export function getCodexConfigPath(): string {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(codexHome, 'config.toml');
}

export function ensureCodexConfigDir(): string {
  const configPath = getCodexConfigPath();
  const configDir = path.dirname(configPath);
  
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  } catch (err: any) {
    throw new Error(
      `Failed to create Codex config directory at ${configDir}: ${err.message || err}\n` +
      `  Check permissions or set CODEX_HOME to a writable location.`
    );
  }
  
  return configPath;
}

export function writeCodexConfig(baseUrl: string): void {
  const configPath = ensureCodexConfigDir();
  
  // Read existing config if it exists
  let content = '';
  if (fs.existsSync(configPath)) {
    try {
      content = fs.readFileSync(configPath, 'utf8');
    } catch (err: any) {
      throw new Error(
        `Failed to read Codex config at ${configPath}: ${err.message || err}\n` +
        `  Check file permissions.`
      );
    }
  }

  const lines = content.split('\n');
  const newLines: string[] = [];
  let ekaiSectionFound = false;
  let inEkaiSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this is the ekai section header
    if (trimmed === '[model_providers.ekai]') {
      ekaiSectionFound = true;
      inEkaiSection = true;
      // Add the section header
      newLines.push(line);
      // Skip all lines until we hit the next section or end of file
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();
        // Stop at next section (starts with [)
        if (nextTrimmed.startsWith('[')) {
          break;
        }
        i++;
      }
      // Add the new ekai config values
      newLines.push('name = "Ekai Gateway"');
      newLines.push(`base_url = "${baseUrl}"`);
      newLines.push('wire_api = "chat"');
      // Add blank line before next section if there is one
      if (i < lines.length) {
        newLines.push('');
        i--; // Process the next section line
      }
      inEkaiSection = false;
      continue;
    }
    
    // Skip any lines that are part of the old ekai section (shouldn't happen, but safety check)
    if (inEkaiSection && trimmed.startsWith('[')) {
      inEkaiSection = false;
    }
    
    newLines.push(line);
  }

  // If ekai section wasn't found, append it
  if (!ekaiSectionFound) {
    // Add separator if content exists
    if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
      newLines.push('');
    }
    newLines.push('[model_providers.ekai]');
    newLines.push('name = "Ekai Gateway"');
    newLines.push(`base_url = "${baseUrl}"`);
    newLines.push('wire_api = "chat"');
  }

  content = newLines.join('\n');
  
  try {
    fs.writeFileSync(configPath, content, 'utf8');
  } catch (err: any) {
    throw new Error(
      `Failed to write Codex config to ${configPath}: ${err.message || err}\n` +
      `  Check file permissions or disk space.`
    );
  }
  
  // Ensure model_provider is set to "ekai" (handles duplicates)
  try {
    setCodexModelProvider();
  } catch (err: any) {
    // If setCodexModelProvider fails, the config was still written, so warn but don't fail
    console.warn(`${symbols.info} ${c.yellow}Warning: Could not update model_provider setting: ${err.message}${c.reset}`);
  }
}

export function setCodexModelProvider(): void {
  const configPath = getCodexConfigPath();
  if (!fs.existsSync(configPath)) {
    // If config doesn't exist yet, writeCodexConfig will create it
    // We'll add model_provider when we write the file
    return;
  }

  let content: string;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch (err: any) {
    throw new Error(
      `Failed to read Codex config at ${configPath}: ${err.message || err}\n` +
      `  Check file permissions.`
    );
  }
  const lines = content.split('\n');
  const newLines: string[] = [];
  let modelProviderFound = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Match model_provider with any variation (with/without quotes, spaces, etc.)
    // Pattern: model_provider = "value" or model_provider="value" or model_provider=value
    if (/^model_provider\s*=\s*/.test(trimmed)) {
      if (!modelProviderFound) {
        // Replace the first occurrence with properly formatted line
        newLines.push('model_provider = "ekai"');
        modelProviderFound = true;
      }
      // Skip any duplicate model_provider lines (removes duplicates)
      continue;
    }
    newLines.push(line);
  }
  
  // If model_provider wasn't found, add it at the top
  if (!modelProviderFound) {
    newLines.unshift('model_provider = "ekai"');
    // Ensure there's a blank line after if there's content
    if (newLines.length > 1 && newLines[1].trim() !== '') {
      newLines.splice(1, 0, '');
    }
  }
  
  try {
    fs.writeFileSync(configPath, newLines.join('\n'), 'utf8');
  } catch (err: any) {
    throw new Error(
      `Failed to write Codex config to ${configPath}: ${err.message || err}\n` +
      `  Check file permissions or disk space.`
    );
  }
}

