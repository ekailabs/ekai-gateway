import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  EmbedFn,
  IngestComponents,
  MemoryRecord,
  ProceduralMemoryRecord,
  QueryResult,
  SectorName,
} from './types.js';
import { PBWM_SECTOR_WEIGHTS, scoreRowPBWM } from './scoring.js';
import { cosineSimilarity } from './utils.js';
import { filterAndCapWorkingMemory } from './wm.js';

const SECTORS: SectorName[] = ['episodic', 'semantic', 'procedural', 'affective'];
const DEFAULT_WEIGHTS: Record<SectorName, number> = {
  episodic: 1,
  semantic: 1,
  procedural: 1,
  affective: 1,
};
const PER_SECTOR_K = 4;
const WORKING_MEMORY_CAP = 8;
const SECTOR_SCAN_LIMIT = 200; // simple scan instead of ANN for v0

export class SqliteMemoryStore {
  private db: Database.Database;
  private embed: EmbedFn;
  private now: () => number;

  constructor(opts: { dbPath: string; embed: EmbedFn; now?: () => number }) {
    this.db = new Database(opts.dbPath);
    this.embed = opts.embed;
    this.now = opts.now ?? (() => Date.now());
    this.prepareSchema();
  }

  async ingest(components: IngestComponents): Promise<MemoryRecord[]> {
    const createdAt = this.now();
    const rows: MemoryRecord[] = [];
    const normalized = normalizeComponents(components);

    for (const [sector, content] of Object.entries(normalized) as Array<[SectorName, string | any]>) {
      // Skip empty content
      if (!content) continue;
      if (typeof content === 'string' && !content.trim()) continue;
      if (typeof content === 'object' && !content.trigger?.trim()) continue;

      // Prepare content for embedding and storage
      let textToEmbed = '';
      let procRow: ProceduralMemoryRecord | undefined;

      if (sector === 'procedural') {
        if (typeof content === 'string') {
          textToEmbed = content;
          procRow = {
            id: randomUUID(),
            trigger: content,
            goal: '',
            context: '',
            result: '',
            steps: [content],
            embedding: [], // Will be set later
            createdAt,
            lastAccessed: createdAt,
          };
        } else {
          textToEmbed = content.trigger;
          procRow = {
            id: randomUUID(),
            trigger: content.trigger,
            goal: content.goal ?? '',
            context: content.context ?? '',
            result: content.result ?? '',
            steps: Array.isArray(content.steps) ? content.steps : [],
            embedding: [], // Will be set later
            createdAt,
            lastAccessed: createdAt,
          };
        }
      } else {
        textToEmbed = content as string;
      }

      const embedding = await this.embed(textToEmbed, sector);

      if (sector === 'procedural' && procRow) {
        procRow.embedding = embedding;
        this.insertProceduralRow(procRow);
        rows.push({
          id: procRow.id,
          sector,
          content: procRow.trigger,
          embedding,
          createdAt,
          lastAccessed: createdAt,
        });
      } else {
        const row: MemoryRecord = {
          id: randomUUID(),
          sector,
          content: textToEmbed,
          embedding,
          createdAt,
          lastAccessed: createdAt,
          eventStart: sector === 'episodic' ? createdAt : null,
          eventEnd: null,
        };
        this.insertRow(row);
        rows.push(row);
      }
    }
    return rows;
  }

  async query(
    queryText: string,
  ): Promise<{ workingMemory: QueryResult[]; perSector: Record<SectorName, QueryResult[]> }> {
    const queryEmbeddings: Record<SectorName, number[]> = {} as Record<SectorName, number[]>;
    for (const sector of SECTORS) {
      queryEmbeddings[sector] = await this.embed(queryText, sector);
    }

    const perSectorResults: Record<SectorName, QueryResult[]> = {
      episodic: [],
      semantic: [],
      procedural: [],
      affective: [],
    };

    for (const sector of SECTORS) {
      const candidates =
        sector === 'procedural'
          ? this.getProceduralRows(SECTOR_SCAN_LIMIT).map((r) => ({
              id: r.id,
              sector: 'procedural' as SectorName,
              content: r.trigger,
              embedding: r.embedding,
              createdAt: r.createdAt,
              lastAccessed: r.lastAccessed,
            }))
          : this.getRowsForSector(sector, SECTOR_SCAN_LIMIT);
      const scored = candidates
        .filter((row) => cosineSimilarity(queryEmbeddings[sector], row.embedding) >= 0.2)
        .map((row) => scoreRowPBWM(row, queryEmbeddings[sector], PBWM_SECTOR_WEIGHTS[sector]))
        .sort((a, b) => b.gateScore - a.gateScore)
        .slice(0, PER_SECTOR_K);
      perSectorResults[sector] = scored;
      this.touchRows(scored.map((r) => r.id));
    }

    const workingMemory = filterAndCapWorkingMemory(perSectorResults, WORKING_MEMORY_CAP);
    return { workingMemory, perSector: perSectorResults };
  }

  getSectorSummary(): Array<{ sector: SectorName; count: number; lastCreatedAt: number | null }> {
    const rows = this.db
      .prepare(
        `select sector, count(*) as count, max(created_at) as lastCreatedAt
         from memory
         group by sector`,
      )
      .all() as Array<{ sector: SectorName; count: number; lastCreatedAt: number | null }>;

    const proceduralRow = this.db
      .prepare(
        `select 'procedural' as sector, count(*) as count, max(created_at) as lastCreatedAt
         from procedural_memory`,
      )
      .get() as { sector: SectorName; count: number; lastCreatedAt: number | null };

    const defaults = SECTORS.map((s) => ({
      sector: s,
      count: 0,
      lastCreatedAt: null as number | null,
    }));

    const map = new Map(rows.map((r) => [r.sector, r]));
    if (proceduralRow) {
      map.set('procedural', proceduralRow);
    }
    return defaults.map((d) => map.get(d.sector) ?? d);
  }

  getRecent(limit: number): (MemoryRecord & { details?: any })[] {
    const rows = this.db
      .prepare(
        `select id, sector, content, embedding, created_at as createdAt, last_accessed as lastAccessed, '{}' as details, event_start as eventStart, event_end as eventEnd
         from memory
         union all
         select id, 'procedural' as sector, trigger as content, embedding, created_at as createdAt, last_accessed as lastAccessed,
                json_object('trigger', trigger, 'goal', goal, 'context', context, 'result', result, 'steps', json(steps)) as details
         from procedural_memory
         order by createdAt desc
         limit @limit`,
      )
      .all({ limit }) as Array<Omit<MemoryRecord, 'embedding'> & { details: string }>;

    return rows.map((row) => {
      const parsed = {
        ...row,
        embedding: JSON.parse((row as any).embedding) as number[],
        details: row.details ? JSON.parse(row.details) : undefined,
        eventStart: row.eventStart ?? null,
        eventEnd: row.eventEnd ?? null,
      };
      
      // Ensure steps is always an array if it exists
      if (parsed.details && parsed.details.steps) {
        if (typeof parsed.details.steps === 'string') {
          try {
            parsed.details.steps = JSON.parse(parsed.details.steps);
          } catch {
            parsed.details.steps = [];
          }
        }
        if (!Array.isArray(parsed.details.steps)) {
          parsed.details.steps = [];
        }
      }
      
      return parsed;
    });
  }

  private insertRow(row: MemoryRecord) {
    this.db
      .prepare(
        `insert into memory (
          id, sector, content, embedding, created_at, last_accessed, event_start, event_end
        ) values (
          @id, @sector, @content, json(@embedding), @createdAt, @lastAccessed, @eventStart, @eventEnd
        )`,
      )
      .run({
        id: row.id,
        sector: row.sector,
        content: row.content,
        embedding: JSON.stringify(row.embedding),
        createdAt: row.createdAt,
        lastAccessed: row.lastAccessed,
        eventStart: row.eventStart ?? null,
        eventEnd: row.eventEnd ?? null,
      });
  }

  private insertProceduralRow(row: ProceduralMemoryRecord) {
    this.db
      .prepare(
        `insert into procedural_memory (
          id, trigger, goal, context, result, steps, embedding, created_at, last_accessed
        ) values (
          @id, @trigger, @goal, @context, @result, json(@steps), json(@embedding), @createdAt, @lastAccessed
        )`,
      )
      .run({
        id: row.id,
        trigger: row.trigger,
        goal: row.goal ?? '',
        context: row.context ?? '',
        result: row.result ?? '',
        steps: JSON.stringify(row.steps),
        embedding: JSON.stringify(row.embedding),
        createdAt: row.createdAt,
        lastAccessed: row.lastAccessed,
      });
  }

  private getRowsForSector(sector: SectorName, limit: number): MemoryRecord[] {
    const rows = this.db
      .prepare(
        `select id, sector, content, embedding, created_at as createdAt, last_accessed as lastAccessed
         from memory
         where sector = @sector
         order by last_accessed desc
         limit @limit`,
      )
      .all({ sector, limit }) as Array<Omit<MemoryRecord, 'embedding'>>;

    return rows.map((row) => ({
      ...row,
      embedding: JSON.parse((row as any).embedding) as number[],
    }));
  }

  private getProceduralRows(limit: number): ProceduralMemoryRecord[] {
    const rows = this.db
      .prepare(
        `select id, trigger, goal, context, result, steps, embedding, created_at as createdAt, last_accessed as lastAccessed
         from procedural_memory
         order by last_accessed desc
         limit @limit`,
      )
      .all({ limit }) as Array<Omit<ProceduralMemoryRecord, 'embedding' | 'steps'>>;

    return rows.map((row) => ({
      ...row,
      steps: JSON.parse((row as any).steps) as string[],
      embedding: JSON.parse((row as any).embedding) as number[],
    }));
  }

  private touchRows(ids: string[]) {
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(
        `update memory
         set last_accessed = ?
         where id in (${placeholders})`,
      )
      .run(this.now(), ...ids);
  }

  private prepareSchema() {
    this.db
      .prepare(
        `create table if not exists memory (
          id text primary key,
          sector text not null,
          content text not null,
          embedding json not null,
          created_at integer not null,
          last_accessed integer not null,
          event_start integer,
          event_end integer
        )`,
      )
      .run();
    this.db.prepare('create index if not exists idx_memory_sector on memory(sector)').run();
    this.db.prepare('create index if not exists idx_memory_last_accessed on memory(last_accessed)').run();

    this.db
      .prepare(
        `create table if not exists procedural_memory (
          id text primary key,
          trigger text not null,
          goal text,
          context text,
          result text,
          steps json not null,
          embedding json not null,
          created_at integer not null,
          last_accessed integer not null
        )`,
      )
      .run();
    this.db.prepare('create index if not exists idx_proc_last_accessed on procedural_memory(last_accessed)').run();
  }

  async updateById(id: string, content: string, sector?: SectorName): Promise<boolean> {
    // First, get the existing record to preserve sector if not changing
    const existing = this.db
      .prepare('select sector from memory where id = ?')
      .get(id) as { sector: SectorName } | undefined;

    if (!existing) {
      return false;
    }

    const targetSector = sector ?? existing.sector;
    
    // Regenerate embedding with new content
    const embedding = await this.embed(content, targetSector);
    
    // Update the record
    const stmt = this.db.prepare(
      'update memory set content = ?, sector = ?, embedding = json(?), last_accessed = ? where id = ?'
    );
    const res = stmt.run(
      content,
      targetSector,
      JSON.stringify(embedding),
      this.now(),
      id
    );
    
    return res.changes > 0;
  }

  deleteById(id: string): number {
    const res1 = this.db.prepare('delete from memory where id = ?').run(id);
    const res2 = this.db.prepare('delete from procedural_memory where id = ?').run(id);
    return (res1.changes ?? 0) + (res2.changes ?? 0);
  }

  deleteAll(): number {
    const res1 = this.db.prepare('delete from memory').run();
    const res2 = this.db.prepare('delete from procedural_memory').run();
    return (res1.changes ?? 0) + (res2.changes ?? 0);
  }
}

function normalizeComponents(input: IngestComponents): Record<SectorName, string | any> {
  return {
    episodic: input.episodic ?? '',
    semantic: input.semantic ?? '',
    procedural: input.procedural ?? '',
    affective: input.affective ?? '',
  };
}
