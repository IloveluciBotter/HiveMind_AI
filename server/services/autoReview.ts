import { logger } from "../middleware/logger";

export type AutoReviewDecision = "approved" | "rejected" | "pending";
export type AutoReviewMode = "auto" | "shadow" | "off";

export interface AutoReviewConfig {
  enabled: boolean;
  mode: AutoReviewMode;
  minDurationSec: number;
  approveThreshold: number;
  rejectThreshold: number;
}

export interface AutoReviewResult {
  decision: AutoReviewDecision;
  scorePct: number;
  attemptDurationSec: number;
  autoReviewedAt: Date;
  message: string;
  shadowDecision?: AutoReviewDecision;
}

export function getAutoReviewConfig(): AutoReviewConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  const enabledEnv = process.env.AUTO_REVIEW_ENABLED;
  const modeEnv = process.env.AUTO_REVIEW_MODE as AutoReviewMode | undefined;
  
  let enabled: boolean;
  if (enabledEnv !== undefined) {
    enabled = enabledEnv.toLowerCase() === "true";
  } else {
    enabled = nodeEnv === "development";
  }
  
  const mode: AutoReviewMode = modeEnv || (enabled ? "auto" : "off");
  const minDurationSec = parseInt(process.env.AUTO_REVIEW_MIN_DURATION_SEC || "30", 10);
  const approveThreshold = parseFloat(process.env.AUTO_REVIEW_APPROVE_THRESHOLD || "1.0");
  const rejectThreshold = parseFloat(process.env.AUTO_REVIEW_REJECT_THRESHOLD || "0.40");
  
  return { enabled, mode, minDurationSec, approveThreshold, rejectThreshold };
}

function computeDecision(
  scorePct: number,
  attemptDurationSec: number,
  config: AutoReviewConfig
): { decision: AutoReviewDecision; message: string } {
  if (scorePct >= config.approveThreshold && attemptDurationSec >= config.minDurationSec) {
    return {
      decision: "approved",
      message: `Auto-approved: score ${(scorePct * 100).toFixed(0)}% >= ${(config.approveThreshold * 100).toFixed(0)}% + minimum time met (${attemptDurationSec}s >= ${config.minDurationSec}s).`,
    };
  }
  
  if (scorePct <= config.rejectThreshold) {
    return {
      decision: "rejected",
      message: `Auto-rejected: score too low (${(scorePct * 100).toFixed(0)}% <= ${(config.rejectThreshold * 100).toFixed(0)}%).`,
    };
  }
  
  return {
    decision: "pending",
    message: `Waiting for human review. Score: ${(scorePct * 100).toFixed(0)}%.`,
  };
}

export function computeAutoReview(
  scorePct: number,
  attemptDurationSec: number,
  config: AutoReviewConfig
): AutoReviewResult {
  const autoReviewedAt = new Date();
  const computed = computeDecision(scorePct, attemptDurationSec, config);
  
  if (config.mode === "off") {
    return {
      decision: "pending",
      scorePct,
      attemptDurationSec,
      autoReviewedAt,
      message: "Auto-review disabled, awaiting human review.",
    };
  }
  
  if (config.mode === "shadow") {
    logger.info({
      message: "Auto-review shadow mode",
      shadowDecision: computed.decision,
      scorePct,
      attemptDurationSec,
    });
    return {
      decision: "pending",
      scorePct,
      attemptDurationSec,
      autoReviewedAt,
      message: `Shadow mode: Would have been ${computed.decision}. Awaiting human review.`,
      shadowDecision: computed.decision,
    };
  }
  
  logger.info({
    message: `Auto-review ${computed.decision}`,
    scorePct,
    attemptDurationSec,
    minDuration: config.minDurationSec,
  });
  
  return {
    decision: computed.decision,
    scorePct,
    attemptDurationSec,
    autoReviewedAt,
    message: computed.message,
  };
}

export function calculateStyleCredits(
  scorePct: number,
  difficulty: string
): number {
  const baseCredits: Record<string, number> = {
    low: 10,
    medium: 25,
    high: 50,
    extreme: 100,
  };
  
  const base = baseCredits[difficulty] || 10;
  return Math.floor(base * scorePct);
}

export function calculateIntelligenceGain(
  scorePct: number,
  difficulty: string
): number {
  const baseGain: Record<string, number> = {
    low: 5,
    medium: 10,
    high: 20,
    extreme: 40,
  };
  
  const base = baseGain[difficulty] || 5;
  return Math.floor(base * scorePct);
}
