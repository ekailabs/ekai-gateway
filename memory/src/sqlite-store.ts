import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { EmbedFn, IngestComponents, MemoryRecord, QueryResult, SectorName } from './types.js';
import { PBWM_SECTOR_WEIGHTS, scoreRowPBWM } from './scoring.js';
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

    for (const [sector, content] of Object.entries(normalized) as Array<[SectorName, string]>) {
      if (!content.trim()) continue;
      const embedding = await this.embed(content, sector);
      const row: MemoryRecord = {
        id: randomUUID(),
        sector,
        content,
        embedding,
        createdAt,
        lastAccessed: createdAt,
      };
      this.insertRow(row);
      rows.push(row);
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
      const candidates = this.getRowsForSector(sector, SECTOR_SCAN_LIMIT);
      const scored = candidates
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

    const defaults = SECTORS.map((s) => ({
      sector: s,
      count: 0,
      lastCreatedAt: null as number | null,
    }));

    const map = new Map(rows.map((r) => [r.sector, r]));
    return defaults.map((d) => map.get(d.sector) ?? d);
  }

  getRecent(limit: number): MemoryRecord[] {
    const rows = this.db
      .prepare(
        `select id, sector, content, embedding, created_at as createdAt, last_accessed as lastAccessed
         from memory
         order by created_at desc
         limit @limit`,
      )
      .all({ limit }) as Array<Omit<MemoryRecord, 'embedding'>>;

    return rows.map((row) => ({
      ...row,
      embedding: JSON.parse((row as any).embedding) as number[],
    }));
  }

  private insertRow(row: MemoryRecord) {
    this.db
      .prepare(
        `insert into memory (
          id, sector, content, embedding, created_at, last_accessed
        ) values (
          @id, @sector, @content, json(@embedding), @createdAt, @lastAccessed
        )`,
      )
      .run({
        id: row.id,
        sector: row.sector,
        content: row.content,
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
          last_accessed integer not null
        )`,
      )
      .run();
    this.db.prepare('create index if not exists idx_memory_sector on memory(sector)').run();
    this.db.prepare('create index if not exists idx_memory_last_accessed on memory(last_accessed)').run();
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
    const stmt = this.db.prepare('delete from memory where id = ?');
    const res = stmt.run(id);
    return res.changes;
  }

  deleteAll(): number {
    const res = this.db.prepare('delete from memory').run();
    return res.changes;
  }
}

function normalizeComponents(input: IngestComponents): Record<SectorName, string> {
  return {
    episodic: input.episodic ?? '',
    semantic: input.semantic ?? '',
    procedural: input.procedural ?? '',
    affective: input.affective ?? '',
  };
}
