import { storage } from "../storage";
import { logger, getIpHash } from "../middleware/logger";
import { Request } from "express";

export type AuditAction =
  | "login_success"
  | "login_failure"
  | "logout"
  | "submission_created"
  | "submission_reviewed"
  | "review_vote"
  | "corpus_item_added"
  | "corpus_item_updated"
  | "corpus_item_deleted"
  | "corpus_item_approved"
  | "corpus_embed_retry"
  | "corpus_force_reembed"
  | "cosmetic_purchase"
  | "cosmetic_equip"
  | "admin_action"
  | "cycle_rollover"
  | "deposit_confirmed"
  | "fee_reserved"
  | "fee_refunded"
  | "fee_routed_to_rewards"
  | "auto_review_approved"
  | "auto_review_rejected"
  | "auto_review_pending"
  | "answer_events_logged"
  | "rollup_completed"
  | "retention_cleanup";

export type AuditTargetType =
  | "corpus_item"
  | "submission"
  | "review"
  | "cosmetic"
  | "user"
  | "session"
  | "cycle"
  | "model_version"
  | "stake"
  | "rewards_pool"
  | "track"
  | "answer_event"
  | "aggregate";

export interface AuditLogEntry {
  action: AuditAction;
  walletAddress?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  metadata?: Record<string, any>;
  requestId: string;
  ipHash?: string;
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await storage.createAuditLog(entry);
    logger.info({
      requestId: entry.requestId,
      audit: true,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      walletAddress: entry.walletAddress,
    });
  } catch (error) {
    logger.error({
      requestId: entry.requestId,
      error: "Failed to write audit log",
      details: error,
    });
  }
}

export function createAuditHelper(req: Request) {
  const requestId = req.requestId;
  const walletAddress = (req as any).walletAddress;
  const ipHash = getIpHash(req);

  return {
    log: async (
      action: AuditAction,
      options?: {
        targetType?: AuditTargetType;
        targetId?: string;
        metadata?: Record<string, any>;
        overrideWallet?: string;
      }
    ) => {
      await logAudit({
        action,
        walletAddress: options?.overrideWallet || walletAddress,
        targetType: options?.targetType,
        targetId: options?.targetId,
        metadata: options?.metadata,
        requestId,
        ipHash,
      });
    },
  };
}
