import * as fs from 'fs';
import * as path from 'path';

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const EMBEDDED_CATALOG_DIR = path.join(PACKAGE_ROOT, 'catalog');
const WORKSPACE_CATALOG_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'model_catalog');

const providerLookup = new Map<string, string>();
let providerCachePrimed = false;

export const CATALOG_FILES = {
  chat: 'chat_completions_providers_v1.json',
  messages: 'messages_providers_v1.json'
};

function resolveCatalogPath(filename: string): string | null {
  const candidates = [
    path.join(EMBEDDED_CATALOG_DIR, filename),
    path.join(WORKSPACE_CATALOG_DIR, filename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadFromProviderFile(filename: string): Set<string> {
  const set = new Set<string>();
  const filePath = resolveCatalogPath(filename);
  if (!filePath) {
    return set;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    if (Array.isArray(json.providers)) {
      json.providers.forEach((p: any) => {
        const providerName = typeof p.provider === 'string' ? p.provider : 'unknown';
        if (Array.isArray(p.models)) {
          p.models.forEach((m: string) => {
            set.add(m);
            const key = m.toLowerCase();
            if (!providerLookup.has(key)) {
              providerLookup.set(key, providerName);
            }
          });
        }
      });
    }
  } catch (err: any) {
    // Log warning but don't throw - catalog loading failure shouldn't break the CLI
    // Users can still type model names manually
    const errorMsg = err.message || String(err);
    if (errorMsg.includes('ENOENT')) {
      // File not found - this is expected if catalog hasn't been synced yet
      return set;
    }
    // Other errors (parse errors, permission issues) - log but continue
    console.warn(`[ekai-cli] Warning: Could not load catalog ${filename}: ${errorMsg}`);
  }
  return set;
}

function ensureProviderCache(): void {
  if (providerCachePrimed) return;
  // Prime both catalogs so inferProvider can resolve providers even before
  // getCompatibleModels is called.
  loadFromProviderFile(CATALOG_FILES.messages);
  loadFromProviderFile(CATALOG_FILES.chat);
  providerCachePrimed = true;
}

export function getCompatibleModels(tool: string): string[] {
  if (tool === 'claude') {
    return Array.from(loadFromProviderFile(CATALOG_FILES.messages)).sort();
  }

  if (tool === 'codex') {
    return Array.from(loadFromProviderFile(CATALOG_FILES.chat)).sort();
  }

  // No tool specified - return all
  const all = new Set<string>();
  loadFromProviderFile(CATALOG_FILES.messages).forEach(m => all.add(m));
  loadFromProviderFile(CATALOG_FILES.chat).forEach(m => all.add(m));
  return Array.from(all).sort();
}

export function inferProvider(model: string): string {
  ensureProviderCache();
  const lower = model.toLowerCase();
  const fromCatalog = providerLookup.get(lower);
  if (fromCatalog) return fromCatalog;

  if (lower.includes('grok')) return 'xai';
  if (lower.includes('claude')) return 'anthropic';
  if (lower.includes('gpt') || lower.startsWith('o')) return 'openai';
  return 'openrouter';
}
