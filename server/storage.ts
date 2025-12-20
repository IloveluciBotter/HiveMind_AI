import {
  type User,
  type InsertUser,
  type Track,
  type Question,
  type Phrase,
  type Cycle,
  type TrainAttempt,
  type Review,
  type Lock,
  type ModelVersion,
  type Benchmark,
  type HubPost,
  type HubSubmission,
  type TrainingCorpusItem,
  type ChatMessage,
  type AuthNonce,
  type Session,
  type WalletBalance,
  type StakeLedgerEntry,
  type RewardsPool,
  type AnswerEvent,
  type QuestionAggregate,
  type TrackAggregate,
  type CycleAggregate,
  users,
  tracks,
  questions,
  phrases,
  cycles,
  trainAttempts,
  reviews,
  locks,
  modelVersions,
  benchmarks,
  hubPosts,
  hubSubmissions,
  trainingPool,
  trainingCorpusItems,
  chatMessages,
  authNonces,
  sessions,
  auditLogs,
  walletBalances,
  stakeLedger,
  rewardsPool,
  answerEvents,
  questionAggregates,
  trackAggregates,
  cycleAggregates,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte, isNull, gt } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserRole(userId: string, role: "reviewer" | "hubPoster" | "admin", value: boolean): Promise<User>;

  // Track operations
  getAllTracks(): Promise<Track[]>;
  getTrack(id: string): Promise<Track | undefined>;
  createTrack(name: string, description?: string): Promise<Track>;
  updateTrack(id: string, name: string, description?: string): Promise<Track | undefined>;
  deleteTrack(id: string): Promise<boolean>;

  // Question operations
  getQuestionsByTrack(trackId: string): Promise<Question[]>;
  getBenchmarkQuestions(): Promise<Question[]>;
  createQuestion(data: {
    trackId?: string;
    text: string;
    options: string[];
    correctIndex: number;
    complexity: number;
    isBenchmark?: boolean;
  }): Promise<Question>;

  // Cycle operations
  getCurrentCycle(): Promise<Cycle | undefined>;
  getCycleByNumber(cycleNumber: number): Promise<Cycle | undefined>;
  createCycle(cycleNumber: number): Promise<Cycle>;
  endCycle(cycleId: string): Promise<Cycle>;
  unlockLocksForCycle(cycleNumber: number): Promise<void>;

  // Phrase operations
  getPhrasesByMentions(minMentions: number, cycleId?: number): Promise<Phrase[]>;
  incrementPhraseMention(normalized: string, redacted: string, trackId?: string): Promise<Phrase>;
  resetPhraseCounts(cycleId: number): Promise<void>;

  // Train attempt operations
  createTrainAttempt(data: {
    userId: string;
    trackId: string;
    difficulty: "low" | "medium" | "high" | "extreme";
    cost: string;
    content: string;
    cycleId: string;
    scorePct?: string;
    attemptDurationSec?: number;
  }): Promise<TrainAttempt>;
  getPendingAttempts(): Promise<TrainAttempt[]>;
  getAttemptById(id: string): Promise<TrainAttempt | undefined>;
  updateAttemptStatus(id: string, status: "approved" | "rejected", evidencePacket?: Record<string, any>): Promise<TrainAttempt>;
  updateAttemptAutoReview(id: string, data: {
    status: "approved" | "rejected" | "pending";
    scorePct: string;
    attemptDurationSec: number;
    autoReviewedAt: Date;
    evidencePacket?: Record<string, any>;
  }): Promise<TrainAttempt>;
  getApprovedAttemptsForCycles(cycleNumbers: number[]): Promise<TrainAttempt[]>;

  // Review operations
  createReview(attemptId: string, reviewerId: string, vote: "approve" | "reject"): Promise<Review>;
  getReviewsForAttempt(attemptId: string): Promise<Review[]>;
  hasReviewerVoted(attemptId: string, reviewerId: string): Promise<boolean>;
  checkReviewConsensus(attemptId: string, difficulty: string): Promise<{ met: boolean; approveCount: number; rejectCount: number }>;

  // Lock operations
  createLock(data: {
    userId: string;
    attemptId: string;
    amount: string;
    originalAmount: string;
    cycleCreated: number;
  }): Promise<Lock>;
  getActiveLocks(userId?: string): Promise<Lock[]>;
  unlockLocks(cycleNumber: number): Promise<void>;

  // Model version operations
  getActiveModelVersion(): Promise<ModelVersion | undefined>;
  getAllModelVersions(): Promise<ModelVersion[]>;
  createModelVersion(cycleId: string, datasetSize: number): Promise<ModelVersion>;
  activateModelVersion(versionId: string): Promise<ModelVersion>;
  deactivateAllModelVersions(): Promise<void>;

  // Benchmark operations
  createBenchmark(data: {
    modelVersionId: string;
    previousModelVersionId?: string;
    score: string;
    previousScore?: string;
  }): Promise<Benchmark>;
  getLatestBenchmark(): Promise<Benchmark | undefined>;
  updateBenchmarkRollback(id: string, wasRolledBack: boolean, quarantinedCycleId?: string): Promise<Benchmark>;

  // Hub operations
  createHubPost(posterId: string, content: string, cycleId: string): Promise<HubPost>;
  getHubPosts(limit?: number): Promise<HubPost[]>;
  createHubSubmission(userId: string, content: string, fee: string): Promise<HubSubmission>;
  getPendingHubSubmissions(): Promise<HubSubmission[]>;
  updateHubSubmissionStatus(id: string, status: "approved" | "rejected"): Promise<HubSubmission>;

  // Training pool operations
  getTrainingPoolAmount(): Promise<string>;
  addToTrainingPool(amount: string): Promise<void>;
  subtractFromTrainingPool(amount: string): Promise<void>;

  // Training corpus operations
  getAllCorpusItems(): Promise<TrainingCorpusItem[]>;
  getCorpusItemsByTrack(trackId: string): Promise<TrainingCorpusItem[]>;
  addCorpusItem(data: {
    trackId: string;
    cycleId: string;
    normalizedText: string;
    sourceAttemptId?: string;
  }): Promise<TrainingCorpusItem>;
  updateCorpusItem(id: string, normalizedText?: string, trackId?: string): Promise<TrainingCorpusItem | undefined>;
  deleteCorpusItem(id: string): Promise<void>;
  getCorpusStats(): Promise<{ total: number; byTrack: Record<string, number> }>;
  getHubSubmissionById(id: string): Promise<HubSubmission | undefined>;
  
  // Chat operations
  searchCorpusItems(query: string, trackId?: string, limit?: number): Promise<TrainingCorpusItem[]>;
  saveChatMessage(data: {
    walletAddress: string;
    trackId?: string;
    aiLevel: number;
    userMessage: string;
    aiResponse: string;
    corpusItemsUsed?: string[];
  }): Promise<ChatMessage>;
  getChatHistory(walletAddress: string, limit?: number): Promise<ChatMessage[]>;

  // Auth nonce operations
  createNonce(walletAddress: string, nonce: string, message: string, expiresAt: Date): Promise<AuthNonce>;
  getUnusedNonce(walletAddress: string, nonce: string): Promise<AuthNonce | undefined>;
  markNonceUsed(id: string): Promise<void>;
  consumeNonceAtomic(walletAddress: string, nonce: string): Promise<AuthNonce | undefined>;
  cleanupExpiredNonces(): Promise<void>;

  // Session operations
  createSession(walletAddress: string, sessionTokenHash: string, expiresAt: Date): Promise<Session>;
  getSessionByTokenHash(sessionTokenHash: string): Promise<Session | undefined>;
  revokeSession(id: string): Promise<void>;
  revokeAllUserSessions(walletAddress: string): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;

  // Audit log operations
  createAuditLog(data: {
    action: string;
    walletAddress?: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, any>;
    requestId: string;
    ipHash?: string;
  }): Promise<void>;

  // Stake operations
  getWalletBalance(walletAddress: string): Promise<WalletBalance | undefined>;
  getOrCreateWalletBalance(walletAddress: string): Promise<WalletBalance>;
  updateStakeBalance(walletAddress: string, newBalance: string): Promise<WalletBalance>;
  createStakeLedgerEntry(data: {
    walletAddress: string;
    txSignature?: string;
    amount: string;
    balanceAfter: string;
    reason: string;
    attemptId?: string;
    metadata?: Record<string, any>;
  }): Promise<StakeLedgerEntry>;
  getStakeLedgerByTxSignature(txSignature: string): Promise<StakeLedgerEntry | undefined>;

  // Rewards pool operations
  getRewardsPool(): Promise<RewardsPool>;
  addToRewardsPool(amount: string): Promise<void>;
  sweepRewardsPool(toWallet: string): Promise<string>;
}

export class DbStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUserRole(userId: string, role: "reviewer" | "hubPoster" | "admin", value: boolean): Promise<User> {
    const updateData: Partial<User> = {};
    if (role === "reviewer") updateData.isReviewer = value;
    if (role === "hubPoster") updateData.isHubPoster = value;
    if (role === "admin") updateData.isAdmin = value;

    const result = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    return result[0];
  }

  // Track operations
  async getAllTracks(): Promise<Track[]> {
    return await db.select().from(tracks).orderBy(tracks.createdAt);
  }

  async getTrack(id: string): Promise<Track | undefined> {
    const result = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    return result[0];
  }

  async createTrack(name: string, description?: string): Promise<Track> {
    const result = await db.insert(tracks).values({ name, description }).returning();
    return result[0];
  }

  async updateTrack(id: string, name: string, description?: string): Promise<Track | undefined> {
    const result = await db
      .update(tracks)
      .set({ name, description })
      .where(eq(tracks.id, id))
      .returning();
    return result[0];
  }

  async deleteTrack(id: string): Promise<boolean> {
    await db.delete(questions).where(eq(questions.trackId, id));
    const result = await db.delete(tracks).where(eq(tracks.id, id)).returning();
    return result.length > 0;
  }

  // Question operations
  async getQuestionsByTrack(trackId: string): Promise<Question[]> {
    return await db.select().from(questions).where(eq(questions.trackId, trackId));
  }

  async getBenchmarkQuestions(): Promise<Question[]> {
    return await db.select().from(questions).where(eq(questions.isBenchmark, true));
  }

  async createQuestion(data: {
    trackId?: string;
    text: string;
    options: string[];
    correctIndex: number;
    complexity: number;
    isBenchmark?: boolean;
  }): Promise<Question> {
    const result = await db.insert(questions).values(data).returning();
    return result[0];
  }

  // Cycle operations
  async getCurrentCycle(): Promise<Cycle | undefined> {
    const result = await db
      .select()
      .from(cycles)
      .where(eq(cycles.isActive, true))
      .orderBy(desc(cycles.cycleNumber))
      .limit(1);
    return result[0];
  }

  async getCycleByNumber(cycleNumber: number): Promise<Cycle | undefined> {
    const result = await db.select().from(cycles).where(eq(cycles.cycleNumber, cycleNumber)).limit(1);
    return result[0];
  }

  async createCycle(cycleNumber: number): Promise<Cycle> {
    // Deactivate all previous cycles
    await db.update(cycles).set({ isActive: false });
    
    const result = await db.insert(cycles).values({ cycleNumber, isActive: true }).returning();
    return result[0];
  }

  async endCycle(cycleId: string): Promise<Cycle> {
    const result = await db
      .update(cycles)
      .set({ isActive: false, endDate: new Date() })
      .where(eq(cycles.id, cycleId))
      .returning();
    return result[0];
  }

  async unlockLocksForCycle(cycleNumber: number): Promise<void> {
    await db
      .update(locks)
      .set({
        unlockedAt: new Date(),
        cyclesRemaining: 0,
      })
      .where(and(sql`${locks.unlockedAt} IS NULL`, sql`${locks.cycleCreated} + 4 <= ${cycleNumber}`));
  }

  // Phrase operations
  async getPhrasesByMentions(minMentions: number, cycleId?: number): Promise<Phrase[]> {
    let query = db.select().from(phrases);
    if (cycleId) {
      query = query.where(and(gte(phrases.globalMentions, minMentions), eq(phrases.lastCycleCounted, cycleId)));
    } else {
      query = query.where(gte(phrases.globalMentions, minMentions));
    }
    return await query;
  }

  async incrementPhraseMention(normalized: string, redacted: string, trackId?: string): Promise<Phrase> {
    const existing = await db.select().from(phrases).where(eq(phrases.normalized, normalized)).limit(1);
    
    if (existing[0]) {
      const currentMentions = existing[0].globalMentions || 0;
      const updates: any = {
        globalMentions: currentMentions + 1,
        updatedAt: new Date(),
      };
      
      if (trackId) {
        const trackMentions = existing[0].trackMentions || {};
        trackMentions[trackId] = (trackMentions[trackId] || 0) + 1;
        updates.trackMentions = trackMentions;
      }
      
      const result = await db.update(phrases).set(updates).where(eq(phrases.id, existing[0].id)).returning();
      return result[0];
    } else {
      const trackMentions = trackId ? { [trackId]: 1 } : {};
      const result = await db
        .insert(phrases)
        .values({
          normalized,
          redacted,
          globalMentions: 1,
          trackMentions,
        })
        .returning();
      return result[0];
    }
  }

  async resetPhraseCounts(cycleId: number): Promise<void> {
    await db.update(phrases).set({ lastCycleCounted: cycleId });
  }

  // Train attempt operations
  async createTrainAttempt(data: {
    userId: string;
    trackId: string;
    difficulty: "low" | "medium" | "high" | "extreme";
    cost: string;
    content: string;
    cycleId: string;
    scorePct?: string;
    attemptDurationSec?: number;
  }): Promise<TrainAttempt> {
    const result = await db.insert(trainAttempts).values({ ...data, status: "pending" }).returning();
    return result[0];
  }

  async getPendingAttempts(): Promise<TrainAttempt[]> {
    return await db.select().from(trainAttempts).where(eq(trainAttempts.status, "pending")).orderBy(desc(trainAttempts.createdAt));
  }

  async getAttemptById(id: string): Promise<TrainAttempt | undefined> {
    const result = await db.select().from(trainAttempts).where(eq(trainAttempts.id, id)).limit(1);
    return result[0];
  }

  async updateAttemptStatus(id: string, status: "approved" | "rejected", evidencePacket?: Record<string, any>): Promise<TrainAttempt> {
    const updates: any = { status, reviewedAt: new Date() };
    if (evidencePacket) updates.evidencePacket = evidencePacket;
    
    const result = await db.update(trainAttempts).set(updates).where(eq(trainAttempts.id, id)).returning();
    return result[0];
  }

  async updateAttemptAutoReview(id: string, data: {
    status: "approved" | "rejected" | "pending";
    scorePct: string;
    attemptDurationSec: number;
    autoReviewedAt: Date;
    evidencePacket?: Record<string, any>;
  }): Promise<TrainAttempt> {
    const updates: any = {
      status: data.status,
      scorePct: data.scorePct,
      attemptDurationSec: data.attemptDurationSec,
      autoReviewedAt: data.autoReviewedAt,
    };
    if (data.status === "approved" || data.status === "rejected") {
      updates.reviewedAt = new Date();
    }
    if (data.evidencePacket) {
      updates.evidencePacket = data.evidencePacket;
    }
    
    const result = await db.update(trainAttempts).set(updates).where(eq(trainAttempts.id, id)).returning();
    return result[0];
  }

  async getApprovedAttemptsForCycles(cycleNumbers: number[]): Promise<TrainAttempt[]> {
    if (cycleNumbers.length === 0) return [];
    
    const cycleList = await db.select({ id: cycles.id, cycleNumber: cycles.cycleNumber }).from(cycles);
    const matchingCycles = cycleList.filter(c => cycleNumbers.includes(c.cycleNumber));
    
    if (matchingCycles.length === 0) return [];
    
    const cycleIdList = matchingCycles.map(c => c.id);
    // Get approved attempts for these cycles
    const allApproved = await db.select().from(trainAttempts).where(eq(trainAttempts.status, "approved"));
    return allApproved.filter(attempt => attempt.cycleId && cycleIdList.includes(attempt.cycleId));
  }

  // Review operations
  async createReview(attemptId: string, reviewerId: string, vote: "approve" | "reject"): Promise<Review> {
    const result = await db.insert(reviews).values({ attemptId, reviewerId, vote }).returning();
    return result[0];
  }

  async getReviewsForAttempt(attemptId: string): Promise<Review[]> {
    return await db.select().from(reviews).where(eq(reviews.attemptId, attemptId));
  }

  async hasReviewerVoted(attemptId: string, reviewerId: string): Promise<boolean> {
    const result = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.attemptId, attemptId), eq(reviews.reviewerId, reviewerId)))
      .limit(1);
    return result.length > 0;
  }

  async checkReviewConsensus(attemptId: string, difficulty: string): Promise<{ met: boolean; approveCount: number; rejectCount: number }> {
    const reviewList = await this.getReviewsForAttempt(attemptId);
    const approveCount = reviewList.filter(r => r.vote === "approve").length;
    const rejectCount = reviewList.filter(r => r.vote === "reject").length;
    
    let required: number;
    if (difficulty === "low" || difficulty === "medium") {
      required = 2; // 2-of-3
    } else {
      required = 3; // 3-of-5
    }
    
    const met = (difficulty === "low" || difficulty === "medium") 
      ? approveCount >= 2 
      : approveCount >= 3;
    
    return { met, approveCount, rejectCount };
  }

  // Lock operations
  async createLock(data: {
    userId: string;
    attemptId: string;
    amount: string;
    originalAmount: string;
    cycleCreated: number;
  }): Promise<Lock> {
    const result = await db
      .insert(locks)
      .values({
        ...data,
        cyclesRemaining: 4,
      })
      .returning();
    return result[0];
  }

  async getActiveLocks(userId?: string): Promise<Lock[]> {
    let query = db.select().from(locks).where(sql`${locks.unlockedAt} IS NULL`);
    if (userId) {
      query = query.where(and(sql`${locks.unlockedAt} IS NULL`, eq(locks.userId, userId)));
    }
    return await query;
  }

  async unlockLocks(cycleNumber: number): Promise<void> {
    await db
      .update(locks)
      .set({
        unlockedAt: new Date(),
        cyclesRemaining: 0,
      })
      .where(and(sql`${locks.unlockedAt} IS NULL`, sql`${locks.cycleCreated} + 4 <= ${cycleNumber}`));
  }

  // Model version operations
  async getActiveModelVersion(): Promise<ModelVersion | undefined> {
    const result = await db.select().from(modelVersions).where(eq(modelVersions.isActive, true)).limit(1);
    return result[0];
  }

  async getAllModelVersions(): Promise<ModelVersion[]> {
    return await db.select().from(modelVersions).orderBy(desc(modelVersions.versionNumber));
  }

  async createModelVersion(cycleId: string, datasetSize: number): Promise<ModelVersion> {
    const latest = await db.select().from(modelVersions).orderBy(desc(modelVersions.versionNumber)).limit(1);
    const versionNumber = latest[0] ? latest[0].versionNumber + 1 : 1;
    
    const result = await db.insert(modelVersions).values({ cycleId, datasetSize, versionNumber }).returning();
    return result[0];
  }

  async activateModelVersion(versionId: string): Promise<ModelVersion> {
    await this.deactivateAllModelVersions();
    const result = await db
      .update(modelVersions)
      .set({ isActive: true, activatedAt: new Date() })
      .where(eq(modelVersions.id, versionId))
      .returning();
    return result[0];
  }

  async deactivateAllModelVersions(): Promise<void> {
    await db.update(modelVersions).set({ isActive: false });
  }

  // Benchmark operations
  async createBenchmark(data: {
    modelVersionId: string;
    previousModelVersionId?: string;
    score: string;
    previousScore?: string;
  }): Promise<Benchmark> {
    const scoreDrop = data.previousScore
      ? (parseFloat(data.previousScore) - parseFloat(data.score)).toString()
      : null;
    
    const result = await db.insert(benchmarks).values({
      ...data,
      scoreDrop,
      wasRolledBack: false,
    }).returning();
    return result[0];
  }

  async getLatestBenchmark(): Promise<Benchmark | undefined> {
    const result = await db.select().from(benchmarks).orderBy(desc(benchmarks.createdAt)).limit(1);
    return result[0];
  }

  async updateBenchmarkRollback(id: string, wasRolledBack: boolean, quarantinedCycleId?: string): Promise<Benchmark> {
    const result = await db
      .update(benchmarks)
      .set({ wasRolledBack, quarantinedCycleId })
      .where(eq(benchmarks.id, id))
      .returning();
    return result[0];
  }

  // Hub operations
  async createHubPost(posterId: string, content: string, cycleId: string): Promise<HubPost> {
    const result = await db.insert(hubPosts).values({ posterId, content, cycleId }).returning();
    return result[0];
  }

  async getHubPosts(limit: number = 50): Promise<HubPost[]> {
    return await db.select().from(hubPosts).orderBy(desc(hubPosts.createdAt)).limit(limit);
  }

  async createHubSubmission(userId: string, content: string, fee: string): Promise<HubSubmission> {
    const result = await db.insert(hubSubmissions).values({ userId, content, fee, status: "pending" }).returning();
    return result[0];
  }

  async getPendingHubSubmissions(): Promise<HubSubmission[]> {
    return await db.select().from(hubSubmissions).where(eq(hubSubmissions.status, "pending")).orderBy(desc(hubSubmissions.createdAt));
  }

  async getHubSubmissionById(id: string): Promise<HubSubmission | undefined> {
    const result = await db.select().from(hubSubmissions).where(eq(hubSubmissions.id, id)).limit(1);
    return result[0];
  }

  async updateHubSubmissionStatus(id: string, status: "approved" | "rejected"): Promise<HubSubmission> {
    const result = await db
      .update(hubSubmissions)
      .set({ status, reviewedAt: new Date() })
      .where(eq(hubSubmissions.id, id))
      .returning();
    return result[0];
  }

  // Training pool operations
  async getTrainingPoolAmount(): Promise<string> {
    const result = await db.select().from(trainingPool).limit(1);
    if (result.length === 0) {
      await db.insert(trainingPool).values({ amount: "0" });
      return "0";
    }
    return result[0].amount;
  }

  async addToTrainingPool(amount: string): Promise<void> {
    const current = await this.getTrainingPoolAmount();
    const newAmount = (parseFloat(current) + parseFloat(amount)).toString();
    const existing = await db.select().from(trainingPool).limit(1);
    if (existing.length > 0) {
      await db.update(trainingPool).set({ amount: newAmount, updatedAt: new Date() });
    } else {
      await db.insert(trainingPool).values({ amount: newAmount });
    }
  }

  async subtractFromTrainingPool(amount: string): Promise<void> {
    const current = await this.getTrainingPoolAmount();
    const newAmount = Math.max(0, parseFloat(current) - parseFloat(amount)).toString();
    const existing = await db.select().from(trainingPool).limit(1);
    if (existing.length > 0) {
      await db.update(trainingPool).set({ amount: newAmount, updatedAt: new Date() });
    } else {
      await db.insert(trainingPool).values({ amount: newAmount });
    }
  }

  // Training corpus operations
  async getAllCorpusItems(): Promise<TrainingCorpusItem[]> {
    return await db.select().from(trainingCorpusItems).orderBy(desc(trainingCorpusItems.createdAt));
  }

  async getCorpusItemsByTrack(trackId: string): Promise<TrainingCorpusItem[]> {
    return await db.select().from(trainingCorpusItems).where(eq(trainingCorpusItems.trackId, trackId)).orderBy(desc(trainingCorpusItems.createdAt));
  }

  async addCorpusItem(data: {
    trackId: string;
    cycleId: string;
    normalizedText: string;
    sourceAttemptId?: string;
  }): Promise<TrainingCorpusItem> {
    const result = await db.insert(trainingCorpusItems).values({
      trackId: data.trackId,
      cycleId: data.cycleId,
      normalizedText: data.normalizedText,
      sourceAttemptId: data.sourceAttemptId,
    }).returning();
    return result[0];
  }

  async updateCorpusItem(id: string, normalizedText?: string, trackId?: string): Promise<TrainingCorpusItem | undefined> {
    const updates: Partial<{ normalizedText: string; trackId: string }> = {};
    if (normalizedText) updates.normalizedText = normalizedText;
    if (trackId) updates.trackId = trackId;
    
    // Don't attempt update if no valid fields
    if (Object.keys(updates).length === 0) {
      return undefined;
    }
    
    const result = await db
      .update(trainingCorpusItems)
      .set(updates)
      .where(eq(trainingCorpusItems.id, id))
      .returning();
    return result[0];
  }

  async deleteCorpusItem(id: string): Promise<void> {
    await db.delete(trainingCorpusItems).where(eq(trainingCorpusItems.id, id));
  }

  async getCorpusStats(): Promise<{ total: number; byTrack: Record<string, number> }> {
    const allItems = await this.getAllCorpusItems();
    const byTrack: Record<string, number> = {};
    
    for (const item of allItems) {
      byTrack[item.trackId] = (byTrack[item.trackId] || 0) + 1;
    }
    
    return {
      total: allItems.length,
      byTrack,
    };
  }

  // Chat operations
  async searchCorpusItems(query: string, trackId?: string, limit: number = 10): Promise<TrainingCorpusItem[]> {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) {
      return [];
    }
    
    // Get all items (optionally filtered by track) and search in memory
    let items: TrainingCorpusItem[];
    if (trackId) {
      items = await this.getCorpusItemsByTrack(trackId);
    } else {
      items = await this.getAllCorpusItems();
    }
    
    // Score items by keyword matches
    const scored = items.map(item => {
      const text = item.normalizedText.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (text.includes(word)) {
          score += 1;
        }
      }
      return { item, score };
    }).filter(s => s.score > 0);
    
    // Sort by score descending and return top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.item);
  }

  async saveChatMessage(data: {
    walletAddress: string;
    trackId?: string;
    aiLevel: number;
    userMessage: string;
    aiResponse: string;
    corpusItemsUsed?: string[];
  }): Promise<ChatMessage> {
    const result = await db.insert(chatMessages).values({
      walletAddress: data.walletAddress,
      trackId: data.trackId || null,
      aiLevel: data.aiLevel,
      userMessage: data.userMessage,
      aiResponse: data.aiResponse,
      corpusItemsUsed: data.corpusItemsUsed || [],
    }).returning();
    return result[0];
  }

  async getChatHistory(walletAddress: string, limit: number = 50): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.walletAddress, walletAddress))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
  }

  // Auth nonce operations
  async createNonce(walletAddress: string, nonce: string, message: string, expiresAt: Date): Promise<AuthNonce> {
    const result = await db.insert(authNonces).values({
      walletAddress,
      nonce,
      message,
      expiresAt,
    }).returning();
    return result[0];
  }

  async getUnusedNonce(walletAddress: string, nonce: string): Promise<AuthNonce | undefined> {
    const now = new Date();
    const result = await db
      .select()
      .from(authNonces)
      .where(
        and(
          eq(authNonces.walletAddress, walletAddress),
          eq(authNonces.nonce, nonce),
          isNull(authNonces.usedAt),
          gt(authNonces.expiresAt, now)
        )
      )
      .limit(1);
    return result[0];
  }

  async markNonceUsed(id: string): Promise<void> {
    await db.update(authNonces).set({ usedAt: new Date() }).where(eq(authNonces.id, id));
  }

  async consumeNonceAtomic(walletAddress: string, nonce: string): Promise<AuthNonce | undefined> {
    const now = new Date();
    const result = await db
      .update(authNonces)
      .set({ usedAt: now })
      .where(
        and(
          eq(authNonces.walletAddress, walletAddress),
          eq(authNonces.nonce, nonce),
          isNull(authNonces.usedAt),
          gt(authNonces.expiresAt, now)
        )
      )
      .returning();
    return result[0];
  }

  async cleanupExpiredNonces(): Promise<void> {
    const now = new Date();
    await db.delete(authNonces).where(lte(authNonces.expiresAt, now));
  }

  // Session operations
  async createSession(walletAddress: string, sessionTokenHash: string, expiresAt: Date): Promise<Session> {
    const result = await db.insert(sessions).values({
      walletAddress,
      sessionTokenHash,
      expiresAt,
    }).returning();
    return result[0];
  }

  async getSessionByTokenHash(sessionTokenHash: string): Promise<Session | undefined> {
    const now = new Date();
    const result = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.sessionTokenHash, sessionTokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now)
        )
      )
      .limit(1);
    return result[0];
  }

  async revokeSession(id: string): Promise<void> {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
  }

  async revokeAllUserSessions(walletAddress: string): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.walletAddress, walletAddress), isNull(sessions.revokedAt)));
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    await db.delete(sessions).where(lte(sessions.expiresAt, now));
  }

  // Audit log operations
  async createAuditLog(data: {
    action: string;
    walletAddress?: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, any>;
    requestId: string;
    ipHash?: string;
  }): Promise<void> {
    await db.insert(auditLogs).values({
      action: data.action,
      walletAddress: data.walletAddress,
      targetType: data.targetType,
      targetId: data.targetId,
      metadata: data.metadata,
      requestId: data.requestId,
      ipHash: data.ipHash,
    });
  }

  // Stake operations
  async getWalletBalance(walletAddress: string): Promise<WalletBalance | undefined> {
    const result = await db
      .select()
      .from(walletBalances)
      .where(eq(walletBalances.walletAddress, walletAddress))
      .limit(1);
    return result[0];
  }

  async getOrCreateWalletBalance(walletAddress: string): Promise<WalletBalance> {
    const existing = await this.getWalletBalance(walletAddress);
    if (existing) {
      return existing;
    }
    const result = await db
      .insert(walletBalances)
      .values({ walletAddress, trainingStakeHive: "0" })
      .onConflictDoNothing()
      .returning();
    if (result[0]) {
      return result[0];
    }
    const created = await this.getWalletBalance(walletAddress);
    if (!created) {
      throw new Error("Failed to create wallet balance");
    }
    return created;
  }

  async updateStakeBalance(walletAddress: string, newBalance: string): Promise<WalletBalance> {
    const result = await db
      .update(walletBalances)
      .set({ trainingStakeHive: newBalance, updatedAt: new Date() })
      .where(eq(walletBalances.walletAddress, walletAddress))
      .returning();
    return result[0];
  }

  async createStakeLedgerEntry(data: {
    walletAddress: string;
    txSignature?: string;
    amount: string;
    balanceAfter: string;
    reason: string;
    attemptId?: string;
    metadata?: Record<string, any>;
  }): Promise<StakeLedgerEntry> {
    const result = await db
      .insert(stakeLedger)
      .values({
        walletAddress: data.walletAddress,
        txSignature: data.txSignature,
        amount: data.amount,
        balanceAfter: data.balanceAfter,
        reason: data.reason,
        attemptId: data.attemptId,
        metadata: data.metadata,
      })
      .returning();
    return result[0];
  }

  async getStakeLedgerByTxSignature(txSignature: string): Promise<StakeLedgerEntry | undefined> {
    const result = await db
      .select()
      .from(stakeLedger)
      .where(eq(stakeLedger.txSignature, txSignature))
      .limit(1);
    return result[0];
  }

  // Rewards pool operations
  async getRewardsPool(): Promise<RewardsPool> {
    const result = await db.select().from(rewardsPool).limit(1);
    if (result[0]) {
      return result[0];
    }
    const created = await db
      .insert(rewardsPool)
      .values({ pendingHive: "0", totalSweptHive: "0" })
      .returning();
    return created[0];
  }

  async addToRewardsPool(amount: string): Promise<void> {
    const pool = await this.getRewardsPool();
    const newPending = (parseFloat(pool.pendingHive) + parseFloat(amount)).toFixed(8);
    await db
      .update(rewardsPool)
      .set({ pendingHive: newPending, updatedAt: new Date() })
      .where(eq(rewardsPool.id, pool.id));
  }

  async sweepRewardsPool(toWallet: string): Promise<string> {
    const pool = await this.getRewardsPool();
    const sweptAmount = pool.pendingHive;
    const newTotalSwept = (parseFloat(pool.totalSweptHive) + parseFloat(sweptAmount)).toFixed(8);
    await db
      .update(rewardsPool)
      .set({
        pendingHive: "0",
        totalSweptHive: newTotalSwept,
        rewardsWalletAddress: toWallet,
        updatedAt: new Date(),
      })
      .where(eq(rewardsPool.id, pool.id));
    return sweptAmount;
  }

  // Answer Events operations
  async createAnswerEvent(data: {
    walletAddress: string;
    attemptId: string;
    trackId: string;
    questionId: string;
    selectedAnswer: number;
    isCorrect: boolean;
    scorePct?: string;
    attemptDurationSec?: number;
    levelAtTime?: number;
    autoDecision?: string;
    cycleNumber?: number;
  }): Promise<AnswerEvent> {
    const result = await db
      .insert(answerEvents)
      .values({
        walletAddress: data.walletAddress,
        attemptId: data.attemptId,
        trackId: data.trackId,
        questionId: data.questionId,
        selectedAnswer: data.selectedAnswer,
        isCorrect: data.isCorrect,
        scorePct: data.scorePct,
        attemptDurationSec: data.attemptDurationSec,
        levelAtTime: data.levelAtTime,
        autoDecision: data.autoDecision,
        cycleNumber: data.cycleNumber,
      })
      .returning();
    return result[0];
  }

  async createAnswerEventsBatch(events: Array<{
    walletAddress: string;
    attemptId: string;
    trackId: string;
    questionId: string;
    selectedAnswer: number;
    isCorrect: boolean;
    scorePct?: string;
    attemptDurationSec?: number;
    levelAtTime?: number;
    autoDecision?: string;
    cycleNumber?: number;
  }>): Promise<number> {
    if (events.length === 0) return 0;
    await db.insert(answerEvents).values(events);
    return events.length;
  }

  async deleteExpiredAnswerEvents(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const result = await db
      .delete(answerEvents)
      .where(lte(answerEvents.createdAt, cutoff));
    return result.rowCount || 0;
  }

  // Aggregate operations
  async getQuestionAggregates(trackId?: string): Promise<QuestionAggregate[]> {
    if (trackId) {
      return db
        .select()
        .from(questionAggregates)
        .where(eq(questionAggregates.trackId, trackId));
    }
    return db.select().from(questionAggregates);
  }

  async getTrackAggregates(): Promise<TrackAggregate[]> {
    return db.select().from(trackAggregates);
  }

  async getCycleAggregates(): Promise<CycleAggregate[]> {
    return db.select().from(cycleAggregates);
  }

  async getCycleAggregate(cycleNumber: number): Promise<CycleAggregate | undefined> {
    const result = await db
      .select()
      .from(cycleAggregates)
      .where(eq(cycleAggregates.cycleNumber, cycleNumber))
      .limit(1);
    return result[0];
  }

  async computeAndUpsertQuestionAggregates(): Promise<number> {
    const stats = await db
      .select({
        questionId: answerEvents.questionId,
        trackId: answerEvents.trackId,
        attemptsTotal: sql<number>`COUNT(*)::int`,
        correctTotal: sql<number>`SUM(CASE WHEN ${answerEvents.isCorrect} THEN 1 ELSE 0 END)::int`,
        avgDurationSec: sql<number>`AVG(${answerEvents.attemptDurationSec})`,
      })
      .from(answerEvents)
      .groupBy(answerEvents.questionId, answerEvents.trackId);

    for (const stat of stats) {
      const accuracyPct = stat.attemptsTotal > 0
        ? ((stat.correctTotal / stat.attemptsTotal) * 100).toFixed(2)
        : "0";
      const avgDuration = stat.avgDurationSec?.toFixed(2) || "0";

      await db
        .insert(questionAggregates)
        .values({
          questionId: stat.questionId,
          trackId: stat.trackId,
          attemptsTotal: stat.attemptsTotal,
          correctTotal: stat.correctTotal,
          accuracyPct,
          avgDurationSec: avgDuration,
          lastCalculatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: questionAggregates.questionId,
          set: {
            attemptsTotal: stat.attemptsTotal,
            correctTotal: stat.correctTotal,
            accuracyPct,
            avgDurationSec: avgDuration,
            lastCalculatedAt: new Date(),
          },
        });
    }
    return stats.length;
  }

  async computeAndUpsertTrackAggregates(): Promise<number> {
    const stats = await db
      .select({
        trackId: answerEvents.trackId,
        attemptsTotal: sql<number>`COUNT(*)::int`,
        correctTotal: sql<number>`SUM(CASE WHEN ${answerEvents.isCorrect} THEN 1 ELSE 0 END)::int`,
      })
      .from(answerEvents)
      .groupBy(answerEvents.trackId);

    for (const stat of stats) {
      const accuracyPct = stat.attemptsTotal > 0
        ? ((stat.correctTotal / stat.attemptsTotal) * 100).toFixed(2)
        : "0";

      await db
        .insert(trackAggregates)
        .values({
          trackId: stat.trackId,
          attemptsTotal: stat.attemptsTotal,
          accuracyPct,
          lastCalculatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: trackAggregates.trackId,
          set: {
            attemptsTotal: stat.attemptsTotal,
            accuracyPct,
            lastCalculatedAt: new Date(),
          },
        });
    }
    return stats.length;
  }

  async computeAndUpsertCycleAggregates(): Promise<number> {
    const stats = await db
      .select({
        cycleNumber: answerEvents.cycleNumber,
        attemptsTotal: sql<number>`COUNT(*)::int`,
        correctTotal: sql<number>`SUM(CASE WHEN ${answerEvents.isCorrect} THEN 1 ELSE 0 END)::int`,
      })
      .from(answerEvents)
      .where(sql`${answerEvents.cycleNumber} IS NOT NULL`)
      .groupBy(answerEvents.cycleNumber);

    for (const stat of stats) {
      if (stat.cycleNumber === null) continue;
      const accuracyPct = stat.attemptsTotal > 0
        ? ((stat.correctTotal / stat.attemptsTotal) * 100).toFixed(2)
        : "0";

      await db
        .insert(cycleAggregates)
        .values({
          cycleNumber: stat.cycleNumber,
          attemptsTotal: stat.attemptsTotal,
          accuracyPct,
          lastCalculatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: cycleAggregates.cycleNumber,
          set: {
            attemptsTotal: stat.attemptsTotal,
            accuracyPct,
            lastCalculatedAt: new Date(),
          },
        });
    }
    return stats.length;
  }
}

export const storage = new DbStorage();
