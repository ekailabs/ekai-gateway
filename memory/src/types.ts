export type SectorName = 'episodic' | 'semantic' | 'procedural' | 'affective';

export interface IngestComponents {
  episodic?: string;
  semantic?: string;
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
  createdAt: number;
  lastAccessed: number;
}

export interface ProceduralMemoryRecord {
  id: string;
  trigger: string;
  goal?: string;
  context?: string;
  result?: string;
  steps: string[];
  embedding: number[];
  createdAt: number;
  lastAccessed: number;
}

export interface QueryResult {
  sector: SectorName;
  id: string;
  content: string;
  score: number;
  similarity: number;
  decay: number;
  createdAt: number;
  lastAccessed: number;
}

export type EmbedFn = (input: string, sector: SectorName) => Promise<number[]>;
