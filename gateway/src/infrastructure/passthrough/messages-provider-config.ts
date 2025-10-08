import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';
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

    return parsed.providers.map(entry => ({
      provider: entry.provider,
      models: entry.models || [],
      config: toPassthroughConfig(entry.messages, entry.provider),
    }));
  } catch (error) {
    logger.error('Failed to load messages providers catalog', error, {
      path: CATALOG_PATH,
      module: 'messages-provider-config',
    });
    return [];
  }
}
