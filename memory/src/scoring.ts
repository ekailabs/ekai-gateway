import type { MemoryRecord, QueryResult, SectorName } from './types.js';
import { cosineSimilarity, gaussianNoise, sigmoid } from './utils.js';

const DEFAULT_SECTOR_WEIGHTS: Record<SectorName, number> = {
  episodic: 1,
  semantic: 1,
  procedural: 1,
  affective: 1,
};

/**
 * Minimal PBWM-inspired gate.
 * expected_value and control are fixed at 1; noise is small Gaussian.
 * Returns QueryResult plus gateScore for downstream gating.
 */
export function scoreRowPBWM(
  row: MemoryRecord,
  queryEmbedding: number[],
  sectorWeight: number = DEFAULT_SECTOR_WEIGHTS[row.sector],
): QueryResult & { gateScore: number } {
  const relevance = cosineSimilarity(queryEmbedding, row.embedding);

  const expectedValue = 0.5;
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
