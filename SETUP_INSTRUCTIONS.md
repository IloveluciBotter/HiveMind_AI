# HiveMind Setup Instructions

## Fixed: drizzle-kit Command

The `drizzle-kit push` command is now working after updating drizzle-kit to version 0.31.4.

## Step-by-Step Setup

### 1. Set DATABASE_URL

**PowerShell:**
```powershell
$env:DATABASE_URL="postgres://USER:PASSWORD@localhost:5432/hivemind"
```

**Or create a `.env` file** (if your environment supports it):
```
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/hivemind
PORT=5000
```

**Replace:**
- `USER` - Your PostgreSQL username
- `PASSWORD` - Your PostgreSQL password  
- `localhost:5432` - Your database host and port
- `hivemind` - Your database name

### 2. Run Database Migrations

```bash
npm run db:push
```

This will create all the HiveMind tables in your database.

**Expected output:**
```
✓ Migration completed successfully
```

### 3. Seed Initial Data

```bash
npm run seed
```

**Expected output:**
```
Starting seed...
Created cycle: 1
Created 4 tracks
Created 10 benchmark questions
...
Seed completed!
```

### 4. Start Development Server

```bash
npm run dev
```

**Expected output:**
```
[timestamp] [express] serving on port 5000
```

### 5. Access Admin UI

Open in your browser:
```
http://localhost:5000/admin
```

You should see the HiveMind Admin Dashboard with 4 tabs:
- Review Queue
- Hub Management  
- Cycle Management
- Model Status

## Troubleshooting

### Error: "DATABASE_URL environment variable is required"
- **Solution**: Set DATABASE_URL before running commands (see step 1)

### Error: "relation does not exist"
- **Solution**: Run `npm run db:push` first to create tables

### Error: Connection refused / Cannot connect to database
- **Solution**: 
  - Verify PostgreSQL is running
  - Check DATABASE_URL is correct
  - Ensure database exists: `CREATE DATABASE hivemind;`

### Admin UI shows errors
- **Solution**: Check browser console (F12) and server logs for specific errors
- Ensure all API endpoints respond (check Network tab in DevTools)

## Next Steps

After successful setup:
1. Create test users with admin/reviewer roles in the database
2. Test submitting train attempts
3. Test review consensus flow
4. Test cycle rollover

