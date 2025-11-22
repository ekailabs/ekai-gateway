import { Request, Response } from 'express';
import { getConfig } from '../../infrastructure/config/app-config.js';
import { logger } from '../../infrastructure/utils/logger.js';

export const handleConfigStatus = (req: Request, res: Response): void => {
  try {
    const config = getConfig();

    const providers = {
      anthropic: config.providers.anthropic.enabled,
      openai: config.providers.openai.enabled,
      openrouter: config.providers.openrouter.enabled,
      xai: config.providers.xai.enabled,
      zai: config.providers.zai.enabled,
      google: config.providers.google.enabled,
    };

    res.json({
      providers,
      mode: config.getMode(),
      hasApiKeys: Object.values(providers).some(Boolean),
      x402Enabled: config.x402.enabled,
      server: {
        environment: config.server.environment,
        port: config.server.port
      }
    });
  } catch (error) {
    logger.error('Failed to fetch config status', error, { requestId: req.requestId, module: 'config-handler' });
    res.status(500).json({ error: 'Failed to fetch config status' });
  }
};
