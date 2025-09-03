import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import { handleOpenAIChat, handleAnthropicChat } from './app/handlers/chat-handler.js';
import { handleModelsRequest } from './app/handlers/models-handler.js';
import { handleUsageRequest } from './app/handlers/usage-handler.js';
import { logger } from './infrastructure/utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.get('/v1/models', handleModelsRequest);
app.post('/v1/chat/completions', handleOpenAIChat);
app.post('/v1/messages', handleAnthropicChat);
app.get('/usage', handleUsageRequest);

// Start server
app.listen(PORT, () => {
  logger.info(`AI Proxy server started`, { 
    port: PORT, 
    environment: process.env.NODE_ENV || 'development' 
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});