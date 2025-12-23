# Leveling Enforcement Feature Tests

This document describes how to test all the leveling enforcement features we just implemented.

## Prerequisites

1. **Database Migration**: Run `npm run db:push` to create the `user_question_history` table
2. **Server Running**: Start the server with `npm run dev`
3. **Test Data**: Ensure you have questions in the database (run `npm run seed` if needed)

## Automated Tests

Run the test suite:

```bash
npm test -- levelingEnforcement
```

This will test:
- `allowedComplexity()` function mapping
- Question history recording
- Question selector with complexity filtering
- History avoidance
- Level policy integration

## Manual Testing Guide

### 1. Test Question History Recording

**Endpoint**: `GET /api/tracks/:trackId/questions` (authenticated)

**Steps**:
1. Authenticate via wallet (connect Phantom wallet in UI)
2. Note your current intelligence level (check `/api/stake/status`)
3. Request questions: `GET /api/tracks/{trackId}/questions?count=10`
4. Verify questions returned match your level's complexity limit
5. Request questions again - should get different questions (history avoidance)

**Expected Behavior**:
- Questions filtered by `complexity <= allowedComplexity(your_level)`
- Questions you've seen before are avoided
- History is recorded immediately when questions are served

**Check History**:
```sql
SELECT * FROM user_question_history 
WHERE wallet_address = 'YOUR_WALLET' 
ORDER BY seen_at DESC 
LIMIT 10;
```

### 2. Test Rank-Up Questions

**Endpoint**: `POST /api/rankup/questions`

**Steps**:
1. Start a rank-up trial (via UI or API)
2. Request rank-up questions: `POST /api/rankup/questions`
3. Verify questions respect min complexity requirement
4. Verify questions still respect max complexity from your level
5. Request again - should get different questions

**Expected Behavior**:
- Questions meet min complexity requirement
- Questions don't exceed your level's max complexity
- History is recorded for rank-up questions too

### 3. Test Chat Level Gating

**Endpoint**: `POST /api/ai/chat`

**Steps**:
1. Note your current intelligence level
2. Ask a simple question: `{"message": "What is 2 + 2?", "aiLevel": 1}`
   - Should work normally (not gated)
3. Ask an advanced question: `{"message": "Explain quantum mechanics", "aiLevel": 1}`
   - Should be gated if above your level
   - Should include learning steps

**Expected Behavior**:
- Server fetches your actual level from `wallet_balances` table
- Level policy applied based on your actual level (not client-provided)
- Advanced questions get gated response with learning steps
- Response includes `isGated: true` and `learningSteps` array when gated

**Check Level Policy**:
- Level 1-10: Simple mode, no RAG, short responses
- Level 11-30: Weak corpus preference, basic RAG
- Level 31-70: Strong corpus preference, citations at 40+
- Level 71-100: Maximum RAG, citations required

### 4. Test Training Submission History

**Endpoint**: `POST /api/train-attempts/submit`

**Steps**:
1. Submit a training attempt with question IDs
2. Check that history is recorded for all questions in the attempt
3. Verify `attemptId` is linked in history records

**Expected Behavior**:
- All questions in the attempt are recorded in history
- History records are linked to the attempt ID
- Subsequent question requests avoid these questions

**SQL Check**:
```sql
SELECT uqh.*, ta.id as attempt_id
FROM user_question_history uqh
LEFT JOIN train_attempts ta ON ta.id = uqh.attempt_id
WHERE uqh.wallet_address = 'YOUR_WALLET'
ORDER BY uqh.seen_at DESC;
```

## Test Scenarios

### Scenario 1: Level 1 User

**Setup**: User with level 1 (complexity 1 only)

**Tests**:
1. Request questions → Should only get complexity 1 questions
2. Ask advanced question in chat → Should be gated with learning steps
3. Submit training → History recorded with attempt ID

### Scenario 2: Level 50 User

**Setup**: User with level 50 (complexity 1-3)

**Tests**:
1. Request questions → Should get complexity 1-3 questions
2. Ask complexity 4-5 question → Should be gated
3. Chat should use strong corpus preference and citations

### Scenario 3: Question History Avoidance

**Setup**: User has seen 5 questions

**Tests**:
1. Request 10 questions → Should get 10 new questions (if available)
2. If only 5 unseen questions available → Should get those 5
3. If no unseen questions → Should fall back to seen questions

### Scenario 4: Rank-Up Trial

**Setup**: User with active rank-up trial (min complexity 3)

**Tests**:
1. Request rank-up questions → Should get complexity 3+ questions
2. But still limited by user's max complexity (from level)
3. History recorded for rank-up questions

## Verification Queries

### Check Question Distribution by Complexity

```sql
SELECT 
  t.name as track,
  q.complexity,
  COUNT(*) as count
FROM questions q
JOIN tracks t ON t.id = q.track_id
GROUP BY t.name, q.complexity
ORDER BY t.name, q.complexity;
```

### Check User's Question History

```sql
SELECT 
  uqh.wallet_address,
  q.complexity,
  COUNT(*) as seen_count,
  MAX(uqh.seen_at) as last_seen
FROM user_question_history uqh
JOIN questions q ON q.id = uqh.question_id
WHERE uqh.wallet_address = 'YOUR_WALLET'
GROUP BY uqh.wallet_address, q.complexity
ORDER BY q.complexity;
```

### Check Level vs Complexity Access

```sql
SELECT 
  wb.wallet_address,
  wb.level,
  CASE 
    WHEN wb.level <= 20 THEN 1
    WHEN wb.level <= 40 THEN 2
    WHEN wb.level <= 60 THEN 3
    WHEN wb.level <= 80 THEN 4
    ELSE 5
  END as max_complexity,
  COUNT(DISTINCT uqh.question_id) as questions_seen
FROM wallet_balances wb
LEFT JOIN user_question_history uqh ON uqh.wallet_address = wb.wallet_address
WHERE wb.wallet_address = 'YOUR_WALLET'
GROUP BY wb.wallet_address, wb.level;
```

## Troubleshooting

### Questions Not Filtered by Level

- Check user's level in `wallet_balances` table
- Verify `allowedComplexity()` function is working
- Check question selector is being called (authenticated requests only)

### History Not Recorded

- Check `user_question_history` table exists (run `npm run db:push`)
- Verify endpoint is calling `recordQuestionHistory()`
- Check for errors in server logs

### Chat Not Gating

- Verify server is fetching level from DB (not using client `aiLevel`)
- Check `estimateQuestionComplexity()` is detecting advanced questions
- Verify level policy is being applied

### Same Questions Returned

- Check if enough questions exist for the complexity level
- Verify history is being recorded
- Check `avoidRecentDays` setting (default: 30 days)

## Expected Results Summary

✅ **Question Serving**:
- Authenticated users get level-appropriate questions
- Questions filtered by complexity
- Previously seen questions avoided

✅ **Question History**:
- Recorded when questions are served
- Recorded when training is submitted
- Linked to attempt ID when available

✅ **Chat Gating**:
- Server-side level enforcement
- Advanced questions get gated responses
- Learning steps provided for gated questions

✅ **Level Policy**:
- Applied based on user's actual level
- RAG behavior scales with level
- Citations required at higher levels


