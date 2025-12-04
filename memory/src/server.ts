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
import { embed } from './providers/embed.js';
import { extract } from './providers/extract.js';
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
    embed,
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/v1/ingest', async (req, res) => {
    const { messages, reasoning, feedback, metadata } = req.body as {
      messages?: Array<{ role: 'user' | 'assistant' | string; content: string }>;
      reasoning?: string;
      feedback?: { type?: 'success' | 'failure'; value?: number; [key: string]: any };
      metadata?: Record<string, any>;
    };

    if (!messages || !messages.length) {
      return res.status(400).json({ error: 'messages is required and must include at least one item' });
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser || !lastUser.content?.trim()) {
      return res.status(400).json({ error: 'at least one user message with content is required' });
    }

    const sourceText = lastUser.content;
    let finalComponents: IngestComponents | undefined;

    try {
      finalComponents = await extract(sourceText);
      // TODO: incorporate reasoning/feedback into sector construction instead of ignoring them
    } catch (err: any) {
      return res.status(500).json({ error: err.message ?? 'extraction failed' });
    }

    if (!finalComponents) {
      return res.status(400).json({ error: 'unable to extract components from messages' });
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
        preview: r.content,
        retrievalCount: (r as any).retrievalCount ?? 0,
        details: (r as any).details,
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

  // Graph traversal endpoints
  app.get('/v1/graph/triples', (req, res) => {
    try {
      const { entity, direction, maxResults, predicate } = req.query;
      if (!entity || typeof entity !== 'string') {
        return res.status(400).json({ error: 'entity query parameter is required' });
      }

      const options: any = {
        maxResults: maxResults ? Number(maxResults) : 100,
        predicateFilter: predicate as string | undefined,
      };

      let triples;
      if (direction === 'incoming' || direction === 'in') {
        triples = store.graph.findTriplesByObject(entity, options);
      } else if (direction === 'outgoing' || direction === 'out') {
        triples = store.graph.findTriplesBySubject(entity, options);
      } else {
        triples = store.graph.findConnectedTriples(entity, options);
      }

      res.json({ entity, triples, count: triples.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'graph query failed' });
    }
  });

  app.get('/v1/graph/neighbors', (req, res) => {
    try {
      const { entity } = req.query;
      if (!entity || typeof entity !== 'string') {
        return res.status(400).json({ error: 'entity query parameter is required' });
      }

      const neighbors = Array.from(store.graph.findNeighbors(entity));
      res.json({ entity, neighbors, count: neighbors.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'neighbors query failed' });
    }
  });

  app.get('/v1/graph/paths', (req, res) => {
    try {
      const { from, to, maxDepth } = req.query;
      if (!from || typeof from !== 'string' || !to || typeof to !== 'string') {
        return res.status(400).json({ error: 'from and to query parameters are required' });
      }

      const paths = store.graph.findPaths(from, to, {
        maxDepth: maxDepth ? Number(maxDepth) : 3,
      });

      res.json({ from, to, paths, count: paths.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'paths query failed' });
    }
  });

  app.get('/v1/graph/visualization', (req, res) => {
    try {
      const { entity, maxDepth, maxNodes } = req.query;
      const centerEntity = (entity as string) || null;
      const depth = maxDepth ? Number(maxDepth) : 2;
      const nodeLimit = maxNodes ? Number(maxNodes) : 50;

      // If no center entity, get a sample of semantic triples
      if (!centerEntity) {
        const allSemantic = store.getRecent(100).filter((r) => r.sector === 'semantic');
        const triples = allSemantic
          .slice(0, nodeLimit)
          .map((r) => (r as any).details)
          .filter((d) => d && d.subject && d.predicate && d.object);

        const nodes = new Set<string>();
        const edges: Array<{ source: string; target: string; predicate: string }> = [];

        for (const triple of triples) {
          nodes.add(triple.subject);
          nodes.add(triple.object);
          edges.push({
            source: triple.subject,
            target: triple.object,
            predicate: triple.predicate,
          });
        }

        return res.json({
          nodes: Array.from(nodes).map((id) => ({ id, label: id })),
          edges,
        });
      }

      // Build graph from center entity
      const reachable = store.graph.findReachableEntities(centerEntity, { maxDepth: depth });
      const nodes = new Set<string>([centerEntity]);
      const edges: Array<{ source: string; target: string; predicate: string }> = [];

      // Add center entity's connections
      const centerTriples = store.graph.findConnectedTriples(centerEntity, { maxResults: 100 });
      for (const triple of centerTriples) {
        nodes.add(triple.subject);
        nodes.add(triple.object);
        edges.push({
          source: triple.subject,
          target: triple.object,
          predicate: triple.predicate,
        });
      }

      // Add connections for reachable entities (up to node limit)
      const reachableArray = Array.from(reachable.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, nodeLimit - nodes.size);

      for (const [entity, _depth] of reachableArray) {
        const entityTriples = store.graph.findTriplesBySubject(entity, { maxResults: 10 });
        for (const triple of entityTriples) {
          if (nodes.has(triple.subject) || nodes.has(triple.object)) {
            nodes.add(triple.subject);
            nodes.add(triple.object);
            edges.push({
              source: triple.subject,
              target: triple.object,
              predicate: triple.predicate,
            });
          }
        }
      }

      res.json({
        center: centerEntity,
        nodes: Array.from(nodes).map((id) => ({ id, label: id })),
        edges,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'visualization query failed' });
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
