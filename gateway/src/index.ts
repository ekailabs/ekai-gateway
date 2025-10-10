// Load environment variables before importing modules
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find project root by looking for package.json (works in both dev and prod)
function findProjectRoot(startPath: string): string {
  let currentPath = startPath;
  while (currentPath !== dirname(currentPath)) {
    if (existsSync(join(currentPath, 'package.json')) && 
        existsSync(join(currentPath, '.env.example'))) {
      return currentPath;
    }
    currentPath = dirname(currentPath);
  }
  // Fallback to process.cwd() if not found
  return process.cwd();
}

const projectRoot = findProjectRoot(__dirname);
dotenv.config({ path: join(projectRoot, '.env') });

// Import application modules
import express from 'express';
import cors from 'cors';
import { handleOpenAIFormatChat, handleAnthropicFormatChat, handleOpenAIResponses } from './app/handlers/chat-handler.js';
import { handleUsageRequest } from './app/handlers/usage-handler.js';
import { logger } from './infrastructure/utils/logger.js';
import { requestContext } from './infrastructure/middleware/request-context.js';
import { requestLogging } from './infrastructure/middleware/request-logging.js';
import { ProviderService } from './domain/services/provider-service.js';

function ensureProvidersConfigured(): void {
  const providerService = new ProviderService();
  const availableProviders = providerService.getAvailableProviders();

  if (availableProviders.length === 0) {
    logger.error(
      'No provider API keys configured. Copy .env.example and set at least one of ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or OPENROUTER_API_KEY before starting the gateway.',
      { module: 'bootstrap' }
    );
    process.exit(1);
  }
}

ensureProvidersConfigured();

const app = express();
const PORT = process.env.PORT || 3001;
// Middleware
app.set('trust proxy', true);
app.use(cors());
app.use(requestContext);
app.use(requestLogging);
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  logger.debug('Health check accessed', { 
    requestId: req.requestId,
    module: 'health-endpoint'
  });
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.post('/v1/chat/completions', handleOpenAIFormatChat);
app.post('/v1/messages', handleAnthropicFormatChat);
app.post('/v1/responses', handleOpenAIResponses);
app.get('/usage', handleUsageRequest);

// Start server
app.listen(PORT, () => {
  logger.info(`Ekai Gateway server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    module: 'server'
  });
});
