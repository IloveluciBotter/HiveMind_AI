# HiveMind Validation Checklist

## Prerequisites

1. **PostgreSQL Database**: Ensure you have a PostgreSQL database running
2. **DATABASE_URL**: Set your database connection string

## Step-by-Step Validation

### 1. Set DATABASE_URL

**Option A: Environment Variable (PowerShell)**
```powershell
$env:DATABASE_URL="postgres://USER:PASSWORD@localhost:5432/hivemind"
```

**Option B: Create .env file** (if your setup supports it)
```
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/hivemind
PORT=5000
```

**Option C: Set in your shell session**
```bash
export DATABASE_URL="postgres://USER:PASSWORD@localhost:5432/hivemind"
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Database Migrations

```bash
npm run db:push
```

**Expected**: Creates all tables in your database (tracks, questions, phrases, train_attempts, reviews, locks, model_versions, benchmarks, hub_posts, hub_submissions, cycles, training_pool, users)

### 4. Seed Initial Data

```bash
npm run seed
```

**Expected Output**:
```
Starting seed...
Created cycle: 1
Created 4 tracks
Created 10 benchmark questions
Created 2 questions for General Knowledge
Created 2 questions for Science
Created 2 questions for Mathematics
Created 2 questions for Programming
Initialized training pool
Seed completed!
```

### 5. Start Development Server

```bash
npm run dev
```

**Expected**: Server starts and prints:
```
[timestamp] [express] serving on port 5000
```

### 6. Access Admin UI

Open in browser:
```
http://localhost:5000/admin
```

**Expected**: Admin dashboard loads with 4 tabs:
- Review Queue
- Hub Management
- Cycle Management
- Model Status

### 7. Verify Database Connection

Check that the server can query the database:
- Admin UI should load without errors
- No database connection errors in console

### 8. Test API Endpoints

**Get Current Cycle:**
```bash
curl http://localhost:5000/api/cycles/current
```

**Get Tracks:**
```bash
curl http://localhost:5000/api/tracks
```

**Get Benchmark Questions:**
```bash
curl http://localhost:5000/api/benchmark-questions
```

## Troubleshooting

### Error: "DATABASE_URL environment variable is required"
- **Solution**: Set DATABASE_URL before running commands

### Error: "relation does not exist"
- **Solution**: Run `npm run db:push` to create tables

### Error: "Cannot find module '@shared/schema'"
- **Solution**: Ensure tsconfig.json has path aliases configured (already done)
- Try: `npm install` to ensure all dependencies are installed

### Error: Port already in use
- **Solution**: Change PORT in environment or kill the process using that port

### Admin UI shows errors
- **Solution**: Check browser console and server logs for specific errors
- Ensure all API endpoints are responding (check Network tab)

## Next Steps After Validation

Once validation passes:
1. Set up user authentication (currently simplified)
2. Create test users with admin/reviewer roles
3. Test full HiveMind flows:
   - Submit train attempt
   - Review and reach consensus
   - Rollover cycle
   - Check model status

## Database Verification

You can verify tables were created:
```sql
-- Connect to your database and run:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Should show:
- benchmarks
- cycles
- hub_posts
- hub_submissions
- locks
- model_versions
- phrases
- questions
- reviews
- tracks
- train_attempts
- training_pool
- users

