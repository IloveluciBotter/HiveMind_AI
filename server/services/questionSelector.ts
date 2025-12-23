/**
 * Question Selector Service
 * 
 * Selects questions based on:
 * - User intelligence level (complexity filtering)
 * - Question history (avoid recently seen questions)
 * - Track filtering
 */

import { storage } from "../storage";
import { logger } from "../middleware/logger";
import type { Question } from "@shared/schema";
import { allowedComplexity } from "../utils/complexityMapping";

// Re-export for convenience
export { allowedComplexity };

export interface QuestionSelectionOptions {
  walletAddress: string;
  trackId?: string;
  intelligenceLevel: number;
  count?: number;
  avoidRecentDays?: number; // Avoid questions seen in last N days (default: 30)
  allowSeen?: boolean; // If true, allow questions user has seen before (default: false)
}

export interface QuestionSelectionResult {
  questions: Question[];
  totalAvailable: number;
  filteredByComplexity: number;
  filteredByHistory: number;
}


/**
 * Select questions for a user based on their intelligence level and history
 */
export async function selectQuestions(
  options: QuestionSelectionOptions
): Promise<QuestionSelectionResult> {
  const {
    walletAddress,
    trackId,
    intelligenceLevel,
    count = 10,
    avoidRecentDays = 30,
    allowSeen = false,
  } = options;

  const maxComplexity = allowedComplexity(intelligenceLevel);
  
  logger.info({
    message: "Selecting questions",
    walletAddress,
    trackId,
    intelligenceLevel,
    maxComplexity,
    count,
  });

  // Get all questions for the track(s)
  let allQuestions: Question[];
  if (trackId) {
    allQuestions = await storage.getQuestionsByTrack(trackId);
  } else {
    // Get questions from all tracks
    const tracks = await storage.getAllTracks();
    allQuestions = [];
    for (const track of tracks) {
      const trackQuestions = await storage.getQuestionsByTrack(track.id);
      allQuestions.push(...trackQuestions);
    }
  }

  const totalAvailable = allQuestions.length;

  // Filter by complexity (only questions user can access)
  const complexityFiltered = allQuestions.filter(
    q => q.complexity <= maxComplexity
  );

  const filteredByComplexity = complexityFiltered.length;

  if (filteredByComplexity === 0) {
    logger.warn({
      message: "No questions available for user complexity level",
      walletAddress,
      intelligenceLevel,
      maxComplexity,
      totalAvailable,
    });
    return {
      questions: [],
      totalAvailable,
      filteredByComplexity: 0,
      filteredByHistory: 0,
    };
  }

  // Get user's question history
  const history = await storage.getUserQuestionHistory(walletAddress, {
    recentDays: allowSeen ? 0 : avoidRecentDays,
  });

  const seenQuestionIds = new Set(history.map(h => h.questionId));

  // Filter out seen questions (if allowSeen is false)
  let availableQuestions = complexityFiltered;
  if (!allowSeen) {
    availableQuestions = complexityFiltered.filter(
      q => !seenQuestionIds.has(q.id)
    );
  }

  const filteredByHistory = availableQuestions.length;

  if (availableQuestions.length === 0) {
    logger.warn({
      message: "No unseen questions available for user",
      walletAddress,
      intelligenceLevel,
      maxComplexity,
      totalAvailable,
      filteredByComplexity,
      historyCount: history.length,
    });
    
    // If no unseen questions, fall back to seen questions (but still respect complexity)
    if (!allowSeen) {
      availableQuestions = complexityFiltered;
      logger.info({
        message: "Falling back to seen questions (no unseen available)",
        walletAddress,
      });
    }
  }

  // Shuffle and select
  const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  logger.info({
    message: "Questions selected",
    walletAddress,
    selected: selected.length,
    totalAvailable,
    filteredByComplexity,
    filteredByHistory,
  });

  return {
    questions: selected,
    totalAvailable,
    filteredByComplexity,
    filteredByHistory,
  };
}

/**
 * Select questions for rank-up trials (allows higher complexity, may allow seen)
 */
export async function selectRankupQuestions(
  options: Omit<QuestionSelectionOptions, "allowSeen"> & {
    minComplexity?: number;
    allowSeen?: boolean;
  }
): Promise<QuestionSelectionResult> {
  const {
    walletAddress,
    trackId,
    intelligenceLevel,
    count = 20,
    avoidRecentDays = 30,
    allowSeen = false,
    minComplexity = 1,
  } = options;

  // For rank-up, we may allow higher complexity than normal
  // But still respect a minimum complexity requirement
  const maxComplexity = allowedComplexity(intelligenceLevel);
  const effectiveMinComplexity = Math.max(minComplexity, 1);
  const effectiveMaxComplexity = Math.max(maxComplexity, effectiveMinComplexity);

  logger.info({
    message: "Selecting rank-up questions",
    walletAddress,
    trackId,
    intelligenceLevel,
    minComplexity: effectiveMinComplexity,
    maxComplexity: effectiveMaxComplexity,
    count,
  });

  // Get all questions for the track(s)
  let allQuestions: Question[];
  if (trackId) {
    allQuestions = await storage.getQuestionsByTrack(trackId);
  } else {
    const tracks = await storage.getAllTracks();
    allQuestions = [];
    for (const track of tracks) {
      const trackQuestions = await storage.getQuestionsByTrack(track.id);
      allQuestions.push(...trackQuestions);
    }
  }

  const totalAvailable = allQuestions.length;

  // Filter by complexity range
  const complexityFiltered = allQuestions.filter(
    q => q.complexity >= effectiveMinComplexity && q.complexity <= effectiveMaxComplexity
  );

  const filteredByComplexity = complexityFiltered.length;

  if (filteredByComplexity === 0) {
    logger.warn({
      message: "No questions available for rank-up complexity range",
      walletAddress,
      intelligenceLevel,
      minComplexity: effectiveMinComplexity,
      maxComplexity: effectiveMaxComplexity,
      totalAvailable,
    });
    return {
      questions: [],
      totalAvailable,
      filteredByComplexity: 0,
      filteredByHistory: 0,
    };
  }

  // Get user's question history
  const history = await storage.getUserQuestionHistory(walletAddress, {
    recentDays: allowSeen ? 0 : avoidRecentDays,
  });

  const seenQuestionIds = new Set(history.map(h => h.questionId));

  // Filter out seen questions (if allowSeen is false)
  let availableQuestions = complexityFiltered;
  if (!allowSeen) {
    availableQuestions = complexityFiltered.filter(
      q => !seenQuestionIds.has(q.id)
    );
  }

  const filteredByHistory = availableQuestions.length;

  // If not enough questions, fall back to seen questions
  if (availableQuestions.length < count && !allowSeen) {
    availableQuestions = complexityFiltered;
    logger.info({
      message: "Falling back to seen questions for rank-up (insufficient unseen)",
      walletAddress,
      available: availableQuestions.length,
      needed: count,
    });
  }

  // Shuffle and select
  const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  logger.info({
    message: "Rank-up questions selected",
    walletAddress,
    selected: selected.length,
    totalAvailable,
    filteredByComplexity,
    filteredByHistory,
  });

  return {
    questions: selected,
    totalAvailable,
    filteredByComplexity,
    filteredByHistory,
  };
}

