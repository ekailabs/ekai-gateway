import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { chatCompletionProxy } from './chat-proxy.js';
import { getModels } from './models.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Models endpoint
app.get('/v1/models', getModels);

// Chat completions endpoint  
app.post('/v1/chat/completions', chatCompletionProxy);

app.listen(PORT, () => {
  console.log(`🚀 AI Proxy Backend running on port ${PORT}`);
});