import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/app-config.js';
import {
  MessagesPassthroughConfig,
  MessagesAuthConfig,
  MessagesModelOptions,
  MessagesUsageConfig,
} from './messages-passthrough.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CATALOG_PATH = path.join(__dirname, '../../../../model_catalog/messages_providers_v1.json');

interface RawMessagesProviderCatalog {
  providers: RawMessagesProviderEntry[];
}

interface RawMessagesProviderEntry {
  provider: string;
  models: string[];
  messages: RawMessagesConfig;
}

interface RawMessagesConfig {
  base_url: string;
  auth: RawMessagesAuthConfig;
  static_headers?: Record<string, string>;
  supported_client_formats: string[];
  model_options?: RawMessagesModelOptions;
  usage?: RawMessagesUsageConfig;
  force_stream_option?: boolean;
}

interface RawMessagesAuthConfig {
  env_var: string;
  header: string;
  scheme?: string;
  template?: string;
}

interface RawMessagesModelOptions {
  ensure_anthropic_suffix?: boolean;
}

interface RawMessagesUsageConfig {
  format: 'anthropic_messages';
}

export interface MessagesProviderDefinition {
  provider: string;
  models: string[];
  config: MessagesPassthroughConfig;
}

function toAuthConfig(raw: RawMessagesAuthConfig): MessagesAuthConfig {
  return {
    envVar: raw.env_var,
    header: raw.header,
    scheme: raw.scheme,
    template: raw.template,
  };
}

function toModelOptions(raw?: RawMessagesModelOptions): MessagesModelOptions | undefined {
  if (!raw) return undefined;
  return {
    ensureAnthropicSuffix: raw.ensure_anthropic_suffix,
  };
}

function toUsageConfig(raw?: RawMessagesUsageConfig): MessagesUsageConfig | undefined {
  if (!raw) return undefined;
  return {
    format: raw.format,
  };
}

function toPassthroughConfig(raw: RawMessagesConfig, provider: string): MessagesPassthroughConfig {
  const config: MessagesPassthroughConfig = {
    provider,
    baseUrl: raw.base_url,
    auth: toAuthConfig(raw.auth),
    staticHeaders: raw.static_headers,
    supportedClientFormats: raw.supported_client_formats,
    modelOptions: toModelOptions(raw.model_options),
    usage: toUsageConfig(raw.usage),
    forceStreamOption: raw.force_stream_option,
  };

  return config;
}

export function loadMessagesProviderDefinitions(): MessagesProviderDefinition[] {
  if (!fs.existsSync(CATALOG_PATH)) {
    logger.warn('Messages providers catalog not found', {
      path: CATALOG_PATH,
      module: 'messages-provider-config',
    });
    return [];
  }

  try {
    const rawContent = fs.readFileSync(CATALOG_PATH, 'utf-8');
    const parsed = JSON.parse(rawContent) as RawMessagesProviderCatalog;

    if (!parsed.providers || !Array.isArray(parsed.providers)) {
      logger.error('Invalid messages providers catalog structure', {
        path: CATALOG_PATH,
        module: 'messages-provider-config',
      });
      return [];
    }

    const definitions = parsed.providers.map(entry => ({
      provider: entry.provider,
      models: entry.models || [],
      config: toPassthroughConfig(entry.messages, entry.provider),
    }));

    // Apply x402 as fallback: only for providers whose API key is NOT configured
    const config = getConfig();
    if (config.x402.enabled) {
      const x402Url = config.x402.messagesUrl;
      
      definitions.forEach(definition => {
        const providerApiKey = definition.config.auth?.envVar;
        const hasProviderKey = providerApiKey && process.env[providerApiKey];
        
        if (!hasProviderKey) {
          logger.info('Provider API key not found, using x402 payment gateway as fallback', {
            provider: definition.provider,
            envVar: providerApiKey,
            originalUrl: definition.config.baseUrl,
            x402Url: x402Url,
            module: 'messages-provider-config',
          });
          
          definition.config = {
            ...definition.config,
            baseUrl: x402Url,
            auth: undefined, // x402 uses payment instead of API keys
            x402Enabled: true,
          };
        } else {
          logger.info('Provider API key found, using normal configuration', {
            provider: definition.provider,
            envVar: providerApiKey,
            module: 'messages-provider-config',
          });
        }
      });
    }

    return definitions;
  } catch (error) {
    logger.error('Failed to load messages providers catalog', error, {
      path: CATALOG_PATH,
      module: 'messages-provider-config',
    });
    return [];
  }
}
