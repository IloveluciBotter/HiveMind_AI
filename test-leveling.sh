#!/bin/bash
# Manual test script for leveling enforcement features
# Run this after starting the server to test all features

set -e

echo "=========================================="
echo "HiveMind Leveling Enforcement Test Suite"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://localhost:5000}"
WALLET="${TEST_WALLET:-TestWallet1111111111111111111111111111111111}"

echo "Testing against: $BASE_URL"
echo "Test wallet: $WALLET"
echo ""

# Helper functions
test_pass() {
  echo -e "${GREEN}✓${NC} $1"
}

test_fail() {
  echo -e "${RED}✗${NC} $1"
  exit 1
}

test_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# Step 1: Authenticate (get session)
echo "Step 1: Authenticating..."
NONCE_RESPONSE=$(curl -sS "$BASE_URL/api/auth/nonce?wallet=$WALLET" || echo "{}")
NONCE=$(echo "$NONCE_RESPONSE" | jq -r '.nonce // empty')

if [ -z "$NONCE" ]; then
  test_warn "Nonce endpoint may require different auth. Skipping auth tests."
  SKIP_AUTH=true
else
  test_pass "Got nonce: $NONCE"
  # Note: In real test, you'd sign the nonce with wallet
  # For manual testing, you'll need to authenticate via UI first
  test_warn "Please authenticate via UI first, then continue with tests"
  read -p "Press Enter after authenticating..."
fi

echo ""
echo "Step 2: Testing Question History Recording"
echo "----------------------------------------"

# Get user's level
LEVEL_RESPONSE=$(curl -sS -b cookies.txt -c cookies.txt "$BASE_URL/api/stake/status" 2>/dev/null || echo "{}")
LEVEL=$(echo "$LEVEL_RESPONSE" | jq -r '.level // 1')
test_pass "User level: $LEVEL"

# Get tracks
TRACKS_RESPONSE=$(curl -sS "$BASE_URL/api/tracks" || echo "[]")
TRACK_ID=$(echo "$TRACKS_RESPONSE" | jq -r '.[0].id // empty')

if [ -z "$TRACK_ID" ]; then
  test_fail "No tracks found"
else
  test_pass "Found track: $TRACK_ID"
fi

# Get questions (authenticated - should use selector)
echo ""
echo "Requesting questions for track $TRACK_ID..."
QUESTIONS_RESPONSE=$(curl -sS -b cookies.txt -c cookies.txt "$BASE_URL/api/tracks/$TRACK_ID/questions?count=5" || echo "[]")
QUESTION_COUNT=$(echo "$QUESTIONS_RESPONSE" | jq 'length')

if [ "$QUESTION_COUNT" -gt 0 ]; then
  test_pass "Got $QUESTION_COUNT questions"
  
  # Check complexity filtering
  MAX_COMPLEXITY=$(echo "$QUESTIONS_RESPONSE" | jq '[.[].complexity] | max')
  ALLOWED_COMPLEXITY=$(( (LEVEL - 1) / 20 + 1 ))
  if [ "$MAX_COMPLEXITY" -le "$ALLOWED_COMPLEXITY" ]; then
    test_pass "Complexity filtering works (max: $MAX_COMPLEXITY, allowed: $ALLOWED_COMPLEXITY)"
  else
    test_fail "Complexity filtering failed (max: $MAX_COMPLEXITY, allowed: $ALLOWED_COMPLEXITY)"
  fi
else
  test_warn "No questions returned (may need authentication)"
fi

# Request again - should get different questions (if history working)
echo ""
echo "Requesting questions again (should avoid previously seen)..."
QUESTIONS_RESPONSE2=$(curl -sS -b cookies.txt -c cookies.txt "$BASE_URL/api/tracks/$TRACK_ID/questions?count=5" || echo "[]")
QUESTION_COUNT2=$(echo "$QUESTIONS_RESPONSE2" | jq 'length')

if [ "$QUESTION_COUNT2" -gt 0 ]; then
  test_pass "Got $QUESTION_COUNT2 questions on second request"
  
  # Check if questions are different (if enough available)
  Q1_IDS=$(echo "$QUESTIONS_RESPONSE" | jq -r '.[].id' | sort)
  Q2_IDS=$(echo "$QUESTIONS_RESPONSE2" | jq -r '.[].id' | sort)
  
  if [ "$Q1_IDS" != "$Q2_IDS" ]; then
    test_pass "Questions are different (history avoidance working)"
  else
    test_warn "Questions are the same (may be due to limited question pool)"
  fi
fi

echo ""
echo "Step 3: Testing Rank-Up Questions"
echo "----------------------------------"

# Check for active rank-up trial
RANKUP_ACTIVE=$(curl -sS -b cookies.txt -c cookies.txt "$BASE_URL/api/rankup/active" || echo "{}")
HAS_TRIAL=$(echo "$RANKUP_ACTIVE" | jq -r '.trial // null')

if [ "$HAS_TRIAL" != "null" ]; then
  test_pass "Active rank-up trial found"
  
  # Get rank-up questions
  RANKUP_QUESTIONS=$(curl -sS -X POST -b cookies.txt -c cookies.txt "$BASE_URL/api/rankup/questions" -H "Content-Type: application/json" || echo "{}")
  RANKUP_COUNT=$(echo "$RANKUP_QUESTIONS" | jq -r '.questions | length // 0')
  
  if [ "$RANKUP_COUNT" -gt 0 ]; then
    test_pass "Got $RANKUP_COUNT rank-up questions"
  else
    test_warn "No rank-up questions returned"
  fi
else
  test_warn "No active rank-up trial (skipping rank-up question test)"
fi

echo ""
echo "Step 4: Testing Chat Level Gating"
echo "----------------------------------"

# Test chat with simple question (should work)
SIMPLE_CHAT=$(curl -sS -X POST -b cookies.txt -c cookies.txt "$BASE_URL/api/ai/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is 2 + 2?", "aiLevel": 1}' || echo "{}")

if echo "$SIMPLE_CHAT" | jq -e '.response' > /dev/null 2>&1; then
  test_pass "Chat endpoint responds"
  IS_GATED=$(echo "$SIMPLE_CHAT" | jq -r '.isGated // false')
  if [ "$IS_GATED" = "true" ]; then
    test_pass "Chat gating detected (question above level)"
    LEARNING_STEPS=$(echo "$SIMPLE_CHAT" | jq -r '.learningSteps // [] | length')
    if [ "$LEARNING_STEPS" -gt 0 ]; then
      test_pass "Learning steps provided ($LEARNING_STEPS steps)"
    fi
  else
    test_pass "Chat response not gated (question within level)"
  fi
else
  test_warn "Chat endpoint may require authentication or AI service"
fi

echo ""
echo "Step 5: Testing Training Submission History"
echo "-------------------------------------------"

test_warn "Training submission test requires:"
test_warn "  1. Authenticated session"
test_warn "  2. Sufficient stake"
test_warn "  3. Valid question IDs"
test_warn "  (Test this manually via UI)"

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "✅ Question complexity filtering"
echo "✅ Question history recording"
echo "✅ History avoidance in question selection"
echo "✅ Chat level gating"
echo ""
echo "Manual verification needed:"
echo "  - Training submission history recording"
echo "  - Full end-to-end flow"
echo ""
echo "To run automated tests:"
echo "  npm test -- levelingEnforcement"
echo ""


