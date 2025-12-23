#!/bin/bash
# HiveMind Production Health Check Script
# Run this on your VPS where the app is deployed

set -e

echo "=========================================="
echo "HiveMind Production Health Check"
echo "=========================================="
echo ""

# A) Health Checks
echo "=== A) INFRASTRUCTURE HEALTH ==="
echo ""

echo "1. Docker Compose Status:"
docker compose ps
echo ""

echo "2. App Container Logs (last 200 lines):"
docker compose logs --tail 200 app
echo ""

echo "3. Caddy Container Logs (last 200 lines):"
docker compose logs --tail 200 caddy
echo ""

echo "4. API Health Endpoint:"
curl -sS https://ai-hive-mind.com/api/health | jq . || echo "FAILED: Could not reach /api/health"
echo ""

echo "5. Frontend Routes (SPA):"
echo "  - Homepage:"
curl -I https://ai-hive-mind.com/ 2>&1 | head -1
echo "  - /train:"
curl -I https://ai-hive-mind.com/train 2>&1 | head -1
echo "  - /chat:"
curl -I https://ai-hive-mind.com/chat 2>&1 | head -1
echo ""

echo "6. Database Tables:"
docker compose exec postgres psql -U postgres -d hivemind -c "\dt"
echo ""

echo "7. Questions Count:"
docker compose exec postgres psql -U postgres -d hivemind -c "select count(*) as questions from questions;"
echo ""

echo "8. Questions by Track and Complexity:"
docker compose exec postgres psql -U postgres -d hivemind -c "
  select t.name as track, q.complexity, count(*) as n
  from questions q join tracks t on t.id=q.track_id
  group by t.name, q.complexity
  order by t.name, q.complexity;"
echo ""

# B) Code Verification
echo ""
echo "=== B) CODE DEPLOYMENT VERIFICATION ==="
echo ""

echo "9. Git Commit (on server):"
cd "$(dirname "$0")" || cd .
git rev-parse HEAD && git log -1 --oneline || echo "WARNING: Not in git repo or git not available"
echo ""

echo "10. Docker Image Info:"
docker image inspect hivemind_ai-app --format '{{.Id}} {{.Created}}' 2>/dev/null || echo "Image not found"
echo ""

echo "11. Container File Structure:"
docker compose exec app sh -c "node -v && echo '---' && ls -la /app && echo '---' && ls -la /app/dist | head -20" || echo "FAILED: Could not exec into container"
echo ""

echo "12. Compiled Code Verification (searching for recent fixes):"
echo "  - levelPolicy:"
docker compose exec app sh -c "grep -r 'levelPolicy' /app/dist 2>/dev/null | head -5 || echo '  (not found or minified)'"
echo "  - numericTolerance:"
docker compose exec app sh -c "grep -r 'numericTolerance' /app/dist 2>/dev/null | head -5 || echo '  (not found or minified)'"
echo "  - settleTrainingAttempt:"
docker compose exec app sh -c "grep -r 'settleTrainingAttempt' /app/dist 2>/dev/null | head -5 || echo '  (not found or minified)'"
echo ""

# C) Behavior Tests
echo ""
echo "=== C) BEHAVIOR TESTS ==="
echo ""

echo "13. Rankup Questions Endpoint (requires auth - check manually in UI):"
echo "    Endpoint: POST /api/rankup/questions"
echo "    Note: This requires authentication. Test via UI or with valid session cookie."
echo ""

echo "14. Training Difficulty Selection:"
echo "    Check that frontend sends 'selectedDifficulty' and server reads 'difficulty'"
echo "    This should be verified via UI testing or API inspection."
echo ""

echo "15. Settlement Service:"
echo "    Settlement is called on training submit. Check stake ledger:"
docker compose exec postgres psql -U postgres -d hivemind -c "
  select reason, count(*) as count, sum(cast(amount as numeric)) as total_amount
  from stake_ledger
  group by reason
  order by reason;" 2>/dev/null || echo "  (stake_ledger table may not exist yet)"
echo ""

echo ""
echo "=========================================="
echo "Health Check Complete"
echo "=========================================="

