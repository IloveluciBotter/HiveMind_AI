/**
 * Level-based policy system for AI intelligence levels (1-100)
 * Provides formula-based configuration instead of hardcoded values
 */

export interface LevelPolicy {
  retrievalEnabled: boolean;
  preferCorpus: "off" | "weak" | "strong";
  topK: number;
  minScore: number;
  requireCitations: boolean;
  maxAnswerTokens: number;
  temperature: number;
  simplicityMode: boolean;
}

/**
 * Linear interpolation helper
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamp value between 0 and 1
 */
function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/**
 * Normalize level to 0-1 range within a level range
 */
function normalizeLevel(level: number, minLevel: number, maxLevel: number): number {
  return clamp01((level - minLevel) / (maxLevel - minLevel));
}

/**
 * Get policy configuration for a given intelligence level (1-100)
 */
export function getLevelPolicy(level: number): LevelPolicy {
  // Clamp level to valid range
  const clampedLevel = Math.max(1, Math.min(100, Math.floor(level)));

  // Levels 1-10: Beginner - No retrieval, simple mode
  if (clampedLevel <= 10) {
    return {
      retrievalEnabled: false,
      preferCorpus: "off",
      simplicityMode: true,
      maxAnswerTokens: 180,
      temperature: 0.8,
      requireCitations: false,
      topK: 0,
      minScore: 0,
    };
  }

  // Levels 11-30: Intermediate - Weak corpus preference, retrieval enabled
  if (clampedLevel <= 30) {
    const t = normalizeLevel(clampedLevel, 11, 30);
    return {
      retrievalEnabled: true,
      preferCorpus: "weak",
      simplicityMode: false,
      topK: Math.round(lerp(2, 4, t)),
      minScore: lerp(0.80, 0.70, t),
      maxAnswerTokens: Math.round(lerp(220, 350, t)),
      temperature: 0.7,
      requireCitations: false,
    };
  }

  // Levels 31-70: Advanced - Strong corpus preference, citations enabled at 40+
  if (clampedLevel <= 70) {
    const t = normalizeLevel(clampedLevel, 31, 70);
    return {
      retrievalEnabled: true,
      preferCorpus: "strong",
      simplicityMode: false,
      topK: Math.round(lerp(4, 8, t)),
      minScore: lerp(0.70, 0.60, t),
      requireCitations: clampedLevel >= 40,
      maxAnswerTokens: Math.round(lerp(350, 700, t)),
      temperature: lerp(0.7, 0.5, t),
    };
  }

  // Levels 71-100: Elite - Strong corpus, citations required, maximum capabilities
  const t = normalizeLevel(clampedLevel, 71, 100);
  return {
    retrievalEnabled: true,
    preferCorpus: "strong",
    simplicityMode: false,
    topK: Math.round(lerp(8, 12, t)),
    minScore: lerp(0.60, 0.55, t),
    requireCitations: true,
    maxAnswerTokens: Math.round(lerp(700, 1200, t)),
    temperature: lerp(0.5, 0.35, t),
  };
}

