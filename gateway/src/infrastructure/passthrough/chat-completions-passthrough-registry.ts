import { ModelUtils } from '../utils/model-utils.js';
import { ChatCompletionsPassthrough, ChatCompletionsPassthroughConfig } from './chat-completions-passthrough.js';
import { loadChatCompletionsProviderDefinitions, ChatCompletionsProviderDefinition } from './chat-completions-provider-config.js';

interface ProviderEntry {
  definition: ChatCompletionsProviderDefinition;
  passthrough?: ChatCompletionsPassthrough;
}

export class ChatCompletionsPassthroughRegistry {
  private readonly providers = new Map<string, ProviderEntry>();
  private readonly modelToProvider = new Map<string, string>();

  constructor(definitions: ChatCompletionsProviderDefinition[]) {
    definitions.forEach(def => {
      this.providers.set(def.provider, { definition: def });

      def.models.forEach(modelId => {
        const normalized = ModelUtils.removeProviderPrefix(modelId);
        this.modelToProvider.set(modelId, def.provider);
        this.modelToProvider.set(normalized, def.provider);
        this.modelToProvider.set(`${def.provider}/${normalized}`, def.provider);
      });
    });
  }

  static fromCatalog(): ChatCompletionsPassthroughRegistry {
    const definitions = loadChatCompletionsProviderDefinitions();
    return new ChatCompletionsPassthroughRegistry(definitions);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getSupportedClientFormats(provider: string): string[] {
    const entry = this.providers.get(provider);
    return entry?.definition.config.supportedClientFormats ?? [];
  }

  findProviderByModel(modelName: string): string | undefined {
    if (!modelName) return undefined;
    const direct = this.modelToProvider.get(modelName);
    if (direct) return direct;

    const normalized = ModelUtils.removeProviderPrefix(modelName);
    return this.modelToProvider.get(normalized);
  }

  getConfig(provider: string): ChatCompletionsPassthroughConfig | undefined {
    const entry = this.providers.get(provider);
    return entry?.definition.config;
  }

  getPassthrough(provider: string): ChatCompletionsPassthrough | undefined {
    const entry = this.providers.get(provider);
    if (!entry) return undefined;

    if (!entry.passthrough) {
      entry.passthrough = new ChatCompletionsPassthrough(entry.definition.config);
      this.providers.set(provider, entry);
    }

    return entry.passthrough;
  }
}

export function createChatCompletionsPassthroughRegistry(): ChatCompletionsPassthroughRegistry {
  return ChatCompletionsPassthroughRegistry.fromCatalog();
}
