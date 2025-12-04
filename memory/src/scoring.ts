import type { MemoryRecord, QueryResult, SectorName } from './types.js';
import { cosineSimilarity, gaussianNoise, sigmoid } from './utils.js';

const DEFAULT_SECTOR_WEIGHTS: Record<SectorName, number> = {
  episodic: 1,
  semantic: 1,
  procedural: 1,
  affective: 1,
};
const RETRIEVAL_SOFTCAP = 10; // for normalization

/**
 * Minimal PBWM-inspired gate.
 * expected_value uses retrieval_count; control fixed for now; noise is small Gaussian.
 * Returns QueryResult plus gateScore for downstream gating.
 */
export function scoreRowPBWM(
  row: MemoryRecord,
  queryEmbedding: number[],
  sectorWeight: number = DEFAULT_SECTOR_WEIGHTS[row.sector],
): QueryResult & { gateScore: number } {
  const relevance = cosineSimilarity(queryEmbedding, row.embedding);

  const expectedValue = normalizeRetrieval(row);
  const controlSignal = 0.5;
  const noise = gaussianNoise(0, 0.05);

  const x =
    0.5 * relevance +
    0.25 * expectedValue +
    0.2 * controlSignal -
    0.05 * noise;

  const gateScore = sigmoid(x);
  const score = gateScore * sectorWeight;

  return {
    sector: row.sector,
    id: row.id,
    content: row.content,
    score,
    similarity: relevance,
    decay: 1,
    createdAt: row.createdAt,
    lastAccessed: row.lastAccessed,
    gateScore,
  };
}

export const PBWM_SECTOR_WEIGHTS = DEFAULT_SECTOR_WEIGHTS;

function normalizeRetrieval(row: MemoryRecord): number {
  const count = (row as any).retrievalCount ?? 0;
  if (count <= 0) return 0;
  // log-style normalization to [0,1] with a soft cap
  return Math.min(1, Math.log(1 + count) / Math.log(1 + RETRIEVAL_SOFTCAP));
}
