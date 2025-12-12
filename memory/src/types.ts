export type SectorName = 'episodic' | 'semantic' | 'procedural' | 'affective';

export interface IngestComponents {
  episodic?: string;
  semantic?: string | {
    subject: string;
    predicate: string;
    object: string;
  };
  procedural?: string | {
    trigger: string;
    goal?: string;
    steps?: string[];
    result?: string;
    context?: string;
  };
  affective?: string;
}

export interface MemoryRecord {
  id: string;
  sector: SectorName;
  content: string;
  embedding: number[];
  profileId: string;
  createdAt: number;
  lastAccessed: number;
  eventStart?: number | null;
  eventEnd?: number | null;
}

export interface ProceduralMemoryRecord {
  id: string;
  trigger: string;
  profileId: string;
  goal?: string;
  context?: string;
  result?: string;
  steps: string[];
  embedding: number[];
  createdAt: number;
  lastAccessed: number;
}

export interface SemanticMemoryRecord {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  profileId: string;
  embedding: number[];
  validFrom: number;
  validTo: number | null;
  createdAt: number;
  updatedAt: number;
  source?: string;
  metadata?: Record<string, any>;
}

export interface QueryResult {
  sector: SectorName;
  id: string;
  profileId: string;
  content: string;
  score: number;
  similarity: number;
  decay: number;
  createdAt: number;
  lastAccessed: number;
}

export type EmbedFn = (input: string, sector: SectorName) => Promise<number[]>;

export interface GraphTraversalOptions {
  maxDepth?: number;
  maxResults?: number;
  includeInvalidated?: boolean;
  predicateFilter?: string;
  profile?: string;
}

export interface GraphPath {
  path: SemanticMemoryRecord[];
  depth: number;
}
