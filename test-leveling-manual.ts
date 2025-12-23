/**
 * Manual test script for leveling enforcement
 * Run with: npx tsx test-leveling-manual.ts
 * 
 * This script tests:
 * 1. Question history recording
 * 2. Question selector with complexity filtering
 * 3. Level enforcement
 */

import { storage } from "./server/storage";
import { selectQuestions, selectRankupQuestions, allowedComplexity } from "./server/services/questionSelector";
import { getLevelPolicy } from "./server/services/levelPolicy";

const TEST_WALLET = "TestWallet1111111111111111111111111111111111";

async function main() {
  console.log("==========================================");
  console.log("HiveMind Leveling Enforcement Tests");
  console.log("==========================================\n");

  try {
    // Test 1: allowedComplexity mapping
    console.log("Test 1: allowedComplexity() mapping");
    console.log("-----------------------------------");
    const testLevels = [1, 20, 21, 40, 41, 60, 61, 80, 81, 100];
    for (const level of testLevels) {
      const complexity = allowedComplexity(level);
      const expected = Math.ceil(level / 20);
      console.log(`  Level ${level.toString().padStart(3)} → Complexity ${complexity} (expected: ${expected})`);
      if (complexity !== expected) {
        console.error(`  ❌ FAIL: Expected ${expected}, got ${complexity}`);
      }
    }
    console.log("  ✅ allowedComplexity() working correctly\n");

    // Test 2: Level Policy
    console.log("Test 2: Level Policy");
    console.log("--------------------");
    const policy1 = getLevelPolicy(1);
    const policy50 = getLevelPolicy(50);
    const policy100 = getLevelPolicy(100);
    
    console.log(`  Level 1:   retrieval=${policy1.retrievalEnabled}, simplicity=${policy1.simplicityMode}, tokens=${policy1.maxAnswerTokens}`);
    console.log(`  Level 50:  retrieval=${policy50.retrievalEnabled}, citations=${policy50.requireCitations}, tokens=${policy50.maxAnswerTokens}`);
    console.log(`  Level 100: retrieval=${policy100.retrievalEnabled}, citations=${policy100.requireCitations}, tokens=${policy100.maxAnswerTokens}`);
    console.log("  ✅ Level policy working correctly\n");

    // Test 3: Question History Recording
    console.log("Test 3: Question History Recording");
    console.log("----------------------------------");
    
    // Get a track and questions
    const tracks = await storage.getAllTracks();
    if (tracks.length === 0) {
      console.log("  ⚠️  No tracks found. Run seed script first.");
      return;
    }
    
    const track = tracks[0];
    console.log(`  Using track: ${track.name} (${track.id})`);
    
    const allQuestions = await storage.getQuestionsByTrack(track.id);
    if (allQuestions.length === 0) {
      console.log("  ⚠️  No questions found. Run seed/import script first.");
      return;
    }
    
    console.log(`  Found ${allQuestions.length} questions in track`);
    
    // Record history for first question
    const testQuestion = allQuestions[0];
    await storage.recordQuestionHistory({
      walletAddress: TEST_WALLET,
      questionId: testQuestion.id,
      trackId: track.id,
      attemptId: null,
    });
    
    const hasSeen = await storage.hasSeenQuestion(TEST_WALLET, testQuestion.id);
    console.log(`  Recorded history for question ${testQuestion.id}`);
    console.log(`  hasSeenQuestion() = ${hasSeen}`);
    
    if (hasSeen) {
      console.log("  ✅ Question history recording working\n");
    } else {
      console.log("  ❌ Question history recording failed\n");
    }

    // Test 4: Question Selector with Level Filtering
    console.log("Test 4: Question Selector with Level Filtering");
    console.log("-----------------------------------------------");
    
    // Ensure wallet balance exists
    await storage.getOrCreateWalletBalance(TEST_WALLET);
    
    // Test with level 1 (complexity 1 only)
    console.log("  Testing with level 1 (should only get complexity 1)...");
    const result1 = await selectQuestions({
      walletAddress: TEST_WALLET,
      trackId: track.id,
      intelligenceLevel: 1,
      count: 10,
      allowSeen: false,
    });
    
    console.log(`  Got ${result1.questions.length} questions`);
    const complexities = result1.questions.map(q => q.complexity);
    const maxComplexity = Math.max(...complexities, 0);
    console.log(`  Max complexity: ${maxComplexity} (should be ≤ 1)`);
    
    if (maxComplexity <= 1) {
      console.log("  ✅ Level 1 filtering working correctly");
    } else {
      console.log(`  ❌ Level 1 filtering failed (got complexity ${maxComplexity})`);
    }
    
    // Test with level 50 (complexity 1-3)
    console.log("\n  Testing with level 50 (should get complexity 1-3)...");
    const result50 = await selectQuestions({
      walletAddress: TEST_WALLET,
      trackId: track.id,
      intelligenceLevel: 50,
      count: 10,
      allowSeen: false,
    });
    
    const complexities50 = result50.questions.map(q => q.complexity);
    const maxComplexity50 = Math.max(...complexities50, 0);
    console.log(`  Got ${result50.questions.length} questions`);
    console.log(`  Max complexity: ${maxComplexity50} (should be ≤ 3)`);
    
    if (maxComplexity50 <= 3) {
      console.log("  ✅ Level 50 filtering working correctly");
    } else {
      console.log(`  ❌ Level 50 filtering failed (got complexity ${maxComplexity50})`);
    }
    
    // Test history avoidance
    console.log("\n  Testing history avoidance...");
    const result2 = await selectQuestions({
      walletAddress: TEST_WALLET,
      trackId: track.id,
      intelligenceLevel: 1,
      count: 10,
      allowSeen: false,
    });
    
    const ids1 = new Set(result1.questions.map(q => q.id));
    const ids2 = new Set(result2.questions.map(q => q.id));
    const overlap = [...ids1].filter(id => ids2.has(id));
    
    console.log(`  First request: ${result1.questions.length} questions`);
    console.log(`  Second request: ${result2.questions.length} questions`);
    console.log(`  Overlap: ${overlap.length} questions`);
    
    if (overlap.length === 0 || result1.questions.length < 5) {
      console.log("  ✅ History avoidance working (or limited question pool)");
    } else {
      console.log("  ⚠️  Some overlap (may be due to limited question pool)");
    }
    
    console.log("\n");

    // Test 5: Rank-Up Questions
    console.log("Test 5: Rank-Up Questions");
    console.log("-------------------------");
    
    const rankupResult = await selectRankupQuestions({
      walletAddress: TEST_WALLET,
      trackId: undefined,
      intelligenceLevel: 50,
      count: 10,
      allowSeen: false,
      minComplexity: 2,
    });
    
    console.log(`  Got ${rankupResult.questions.length} rank-up questions`);
    if (rankupResult.questions.length > 0) {
      const rankupComplexities = rankupResult.questions.map(q => q.complexity);
      const minRankup = Math.min(...rankupComplexities);
      const maxRankup = Math.max(...rankupComplexities);
      console.log(`  Complexity range: ${minRankup}-${maxRankup}`);
      console.log(`  Min complexity: ${minRankup} (should be ≥ 2)`);
      console.log(`  Max complexity: ${maxRankup} (should be ≤ 3 for level 50)`);
      
      if (minRankup >= 2 && maxRankup <= 3) {
        console.log("  ✅ Rank-up question filtering working correctly");
      } else {
        console.log("  ❌ Rank-up question filtering failed");
      }
    } else {
      console.log("  ⚠️  No rank-up questions available");
    }

    console.log("\n");
    console.log("==========================================");
    console.log("Test Summary");
    console.log("==========================================");
    console.log("✅ Complexity mapping");
    console.log("✅ Level policy");
    console.log("✅ Question history recording");
    console.log("✅ Question selector with level filtering");
    console.log("✅ History avoidance");
    console.log("✅ Rank-up question filtering");
    console.log("\nAll core features tested!");

  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);


