import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';
import {
  ChatCompletionsPassthroughConfig,
  ChatCompletionsAuthConfig,
  ChatCompletionsUsageConfig,
  ChatCompletionsPayloadDefaults,
} from './chat-completions-passthrough.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CATALOG_PATH = path.join(__dirname, '../../../../model_catalog/chat_completions_providers_v1.json');

interface RawChatCompletionsCatalog {
  providers: RawChatCompletionsEntry[];
}

interface RawChatCompletionsEntry {
  provider: string;
  models: string[];
  chat_completions: RawChatCompletionsConfig;
}

interface RawChatCompletionsConfig {
  base_url: string;
  auth: RawChatCompletionsAuthConfig;
  static_headers?: Record<string, string>;
  supported_client_formats: string[];
  payload_defaults?: ChatCompletionsPayloadDefaults;
  usage?: RawChatCompletionsUsageConfig;
  force_stream_option?: boolean;
}

interface RawChatCompletionsAuthConfig {
  env_var: string;
  header: string;
  scheme?: string;
  template?: string;
}

interface RawChatCompletionsUsageConfig {
  format: ChatCompletionsUsageConfig['format'];
}

export interface ChatCompletionsProviderDefinition {
  provider: string;
  models: string[];
  config: ChatCompletionsPassthroughConfig;
}

function toAuthConfig(raw: RawChatCompletionsAuthConfig): ChatCompletionsAuthConfig {
  return {
    envVar: raw.env_var,
    header: raw.header,
    scheme: raw.scheme,
    template: raw.template,
  };
}

function toUsageConfig(raw?: RawChatCompletionsUsageConfig): ChatCompletionsUsageConfig | undefined {
  if (!raw) return undefined;
  return {
    format: raw.format,
  };
}

function toPassthroughConfig(raw: RawChatCompletionsConfig, provider: string): ChatCompletionsPassthroughConfig {
  return {
    provider,
    baseUrl: raw.base_url,
    auth: toAuthConfig(raw.auth),
    staticHeaders: raw.static_headers,
    supportedClientFormats: raw.supported_client_formats,
    payloadDefaults: raw.payload_defaults,
    usage: toUsageConfig(raw.usage),
    forceStreamOption: raw.force_stream_option,
  };
}

export function loadChatCompletionsProviderDefinitions(): ChatCompletionsProviderDefinition[] {
  if (!fs.existsSync(CATALOG_PATH)) {
    logger.warn('Chat completions providers catalog not found', {
      path: CATALOG_PATH,
      module: 'chat-completions-provider-config',
    });
    return [];
  }

  try {
    const rawContent = fs.readFileSync(CATALOG_PATH, 'utf-8');
    const parsed = JSON.parse(rawContent) as RawChatCompletionsCatalog;

    if (!Array.isArray(parsed.providers)) {
      logger.error('Invalid chat completions providers catalog structure', {
        path: CATALOG_PATH,
        module: 'chat-completions-provider-config',
      });
      return [];
    }

    return parsed.providers.map(entry => ({
      provider: entry.provider,
      models: entry.models || [],
      config: toPassthroughConfig(entry.chat_completions, entry.provider),
    }));
  } catch (error) {
    logger.error('Failed to load chat completions providers catalog', error, {
      path: CATALOG_PATH,
      module: 'chat-completions-provider-config',
    });
    return [];
  }
}
