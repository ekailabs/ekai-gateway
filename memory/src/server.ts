import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load env from memory/.env (dist is under memory/dist) then repo root .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import { SqliteMemoryStore } from './sqlite-store.js';
import { embedWithGemini } from './embed-gemini.js';
import { extractWithGemini } from './extract-gemini.js';
import type { IngestComponents } from './types.js';

const PORT = Number(process.env.MEMORY_PORT ?? 4005);
const DB_PATH = process.env.MEMORY_DB_PATH ?? './memory.db';

async function main() {
  const app = express();
  const corsOrigins =
    process.env.MEMORY_CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ?? '*';
  app.use(
    cors({
      origin: corsOrigins,
    }),
  );
  app.options('*', cors({ origin: corsOrigins }));
  app.use(express.json({ limit: '2mb' }));

  const store = new SqliteMemoryStore({
    dbPath: DB_PATH,
    embed: embedWithGemini,
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/v1/ingest', async (req, res) => {
    const { query, components } = req.body as {
      query?: string;
      components?: IngestComponents;
    };

    const sourceText = query;

    let finalComponents: IngestComponents | undefined = components;

    if (!finalComponents && sourceText) {
      try {
        finalComponents = await extractWithGemini(sourceText);
      } catch (err: any) {
        return res.status(500).json({ error: err.message ?? 'extraction failed' });
      }
    }

    if (!finalComponents) {
      return res.status(400).json({ error: 'components or query is required' });
    }
    try {
      const rows = await store.ingest(finalComponents);
      res.json({ stored: rows.length, ids: rows.map((r) => r.id) });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'ingest failed' });
    }
  });

  app.get('/v1/summary', (req, res) => {
    try {
      const limit = Number(req.query.limit) || 50;
      const summary = store.getSectorSummary();
      const recent = store.getRecent(limit).map((r) => ({
        id: r.id,
        sector: r.sector,
        createdAt: r.createdAt,
        lastAccessed: r.lastAccessed,
        preview: r.content, // Send full content for client-side truncation/expansion
      }));
      res.json({ summary, recent });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'summary failed' });
    }
  });

  app.put('/v1/memory/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { content, sector } = req.body as { content?: string; sector?: string };
      
      if (!id) return res.status(400).json({ error: 'id_required' });
      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'content_required' });
      }

      const updated = await store.updateById(id, content.trim(), sector as any);
      if (!updated) {
        return res.status(404).json({ error: 'not_found', id });
      }
      res.json({ updated: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'update failed' });
    }
  });

  app.delete('/v1/memory/:id', (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'id_required' });
      const deleted = store.deleteById(id);
      if (!deleted) {
        return res.status(404).json({ error: 'not_found', id });
      }
      res.json({ deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'delete failed' });
    }
  });

  app.delete('/v1/memory', (_req, res) => {
    try {
      const deleted = store.deleteAll();
      res.json({ deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'delete all failed' });
    }
  });

  app.post('/v1/search', async (req, res) => {
    const { query } = req.body as { query?: string };
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'query is required' });
    }
    try {
      const result = await store.query(query);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'query failed' });
    }
  });

  // Fallback 404 with CORS headers
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Memory service listening on :${PORT}, db at ${DB_PATH}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
