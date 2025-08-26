import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { openRouterProxy } from './openrouter-proxy.js';
import { getModels } from './models.js';

dotenv.config();

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
app.post('/v1/chat/completions', openRouterProxy);

app.listen(PORT, () => {
  console.log(`🚀 OpenRouter Proxy Backend running on port ${PORT}`);
});