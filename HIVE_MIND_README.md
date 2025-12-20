# HiveMind $HIVE System - Testing Guide

## Overview

The HiveMind system is a decentralized AI training platform where users submit training attempts that are reviewed by consensus. Approved submissions contribute to model training, and users are rewarded with locked HIVE tokens.

## Setup

1. **Database Setup**
   ```bash
   # Ensure DATABASE_URL is set in your environment
   # Run migrations
   npm run db:push
   
   # Seed initial data (tracks, questions, benchmark pack)
   npm run seed
   ```

2. **Start the Server**
   ```bash
   npm run dev
   ```

## Key Features

### 1. Train Attempt Submission
- Users submit training content with a difficulty level (low/medium/high/extreme)
- Each difficulty has a cost in HIVE tokens
- Submissions go to a review queue

### 2. Review Consensus
- **Low/Medium**: Requires 2-of-3 reviewers to approve
- **High/Extreme**: Requires 3-of-5 reviewers to approve
- If consensus not met → rejection

### 3. Economics
- **Approved**: 
  - 80% refunded immediately (liquid)
  - 20% locked for 4 cycles
  - +5% from Training Pool added to lock (total 25% locked)
- **Rejected**: 
  - 50% burned
  - 50% goes to Training Pool
  - No lock

### 4. Cycles
- Weekly cycles (can be manually rolled over for testing)
- Each cycle:
  - Processes phrase mining (≥50 mentions)
  - Creates new model version from last 4 cycles
  - Runs benchmark
  - Auto-rollback if score drops ≥10%

### 5. Global Hub
- Admin-selected posters can post directly
- Regular users pay fee Y to submit
- Admin approves/rejects submissions
- Approved: 50% burn, 50% pool
- Rejected: full refund

## Testing Flows

### Flow 1: Submit and Review Train Attempt

1. **Submit Attempt** (as regular user):
   ```bash
   POST /api/train-attempts/submit
   {
     "trackId": "<track-id>",
     "difficulty": "low",
     "content": "Training content here"
   }
   ```

2. **Review Attempt** (as reviewer):
   ```bash
   POST /api/reviews/submit
   {
     "attemptId": "<attempt-id>",
     "vote": "approve"  # or "reject"
   }
   ```

3. **Check Status**:
   ```bash
   GET /api/train-attempts/<attempt-id>
   ```

### Flow 2: Cycle Rollover

1. **Access Admin Dashboard**:
   - Navigate to `/admin` in browser
   - Go to "Cycle Management" tab

2. **Rollover Cycle**:
   - Click "Rollover Cycle" button
   - System will:
     - End current cycle
     - Create new cycle
     - Unlock locks from 4 cycles ago
     - Process phrase mining
     - Create new model version
     - Run benchmark
     - Check for rollback

3. **Check Model Status**:
   - Go to "Model Status" tab
   - View active model, benchmark scores, training pool

### Flow 3: Hub Submission

1. **Submit to Hub** (as regular user):
   ```bash
   POST /api/hub/submit
   {
     "content": "Hub post content"
   }
   ```

2. **Approve/Reject** (as admin):
   - Navigate to `/admin`
   - Go to "Hub Management" tab
   - Approve or reject pending submissions

### Flow 4: Review Queue Management

1. **View Pending Attempts**:
   - Navigate to `/admin`
   - Go to "Review Queue" tab
   - See all pending train attempts

2. **Vote on Attempts**:
   - Click "Approve" or "Reject"
   - System checks consensus automatically
   - If consensus met, attempt is approved/rejected

## API Endpoints

### Public Endpoints
- `GET /api/tracks` - List all tracks
- `GET /api/tracks/:trackId/questions` - Get questions for track
- `GET /api/benchmark-questions` - Get benchmark questions
- `GET /api/cycles/current` - Get current cycle
- `GET /api/hub/posts` - Get hub posts

### User Endpoints (Requires Auth)
- `POST /api/train-attempts/submit` - Submit training attempt
- `GET /api/train-attempts/:id` - Get attempt details
- `GET /api/locks` - Get user's active locks
- `POST /api/hub/submit` - Submit hub post

### Reviewer Endpoints (Requires Reviewer Role)
- `GET /api/train-attempts/pending` - Get pending attempts
- `POST /api/reviews/submit` - Submit review vote
- `GET /api/reviews/attempt/:attemptId` - Get reviews for attempt

### Admin Endpoints (Requires Admin Role)
- `POST /api/cycles/rollover` - Rollover to new cycle
- `GET /api/admin/model-status` - Get model/benchmark status
- `GET /api/admin/training-pool` - Get training pool amount
- `GET /api/hub/submissions/pending` - Get pending hub submissions
- `POST /api/hub/submissions/:id/approve` - Approve hub submission
- `POST /api/hub/submissions/:id/reject` - Reject hub submission
- `POST /api/admin/users/:id/role` - Update user role

## Admin UI

Access the admin dashboard at `/admin` in your browser. The dashboard includes:

1. **Review Queue**: View and vote on pending train attempts
2. **Hub Management**: Approve/reject hub submissions
3. **Cycle Management**: Rollover cycles manually
4. **Model Status**: View active model, benchmarks, training pool

## Database Schema

Key tables:
- `tracks` - Training tracks
- `questions` - Questions (with benchmark flag)
- `phrases` - Normalized phrases with mention counts
- `train_attempts` - User submissions
- `reviews` - Reviewer votes
- `cycles` - Weekly cycles
- `locks` - Locked HIVE tokens
- `model_versions` - Model versions
- `benchmarks` - Benchmark scores
- `hub_posts` - Hub messages
- `hub_submissions` - User hub submissions
- `training_pool` - Global training pool

## Notes

- **Authentication**: Currently simplified - you'll need to implement proper session/auth
- **User Roles**: Set via admin endpoint or directly in database
- **Phrase Mining**: Phrases with ≥50 mentions are stored (normalized + redacted)
- **Model Training**: Simulated - creates model versions but doesn't actually train
- **Benchmark**: Simulated scores - in production would run actual model evaluation
- **Quarantine**: Quarantined cycles are hidden from users but stored in database

## Troubleshooting

1. **Database Connection**: Ensure `DATABASE_URL` is set correctly
2. **Migrations**: Run `npm run db:push` if schema changes
3. **Seed Data**: Run `npm run seed` to populate initial tracks/questions
4. **Admin Access**: Set `isAdmin: true` in users table for admin access
5. **Reviewer Access**: Set `isReviewer: true` in users table for reviewer access

