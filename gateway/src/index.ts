import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import { handleOpenAIFormatChat, handleAnthropicFormatChat, handleOpenAIResponses } from './app/handlers/chat-handler.js';
import { handleUsageRequest } from './app/handlers/usage-handler.js';
import { logger } from './infrastructure/utils/logger.js';
import { requestContext } from './infrastructure/middleware/request-context.js';
import { requestLogging } from './infrastructure/middleware/request-logging.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
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
