# Troubleshooting Guide

## Nonce Generation 500 Error

If you're seeing `[HTTP/1.1 500 Internal Server Error]` on `/api/auth/nonce`, check the following:

### Step 1: Check Server Logs

Look at the server terminal output where you ran `npm run dev`. The actual error message will be there. Common causes:

1. **Database not connected**: Check that `DATABASE_URL` is set correctly
2. **Tables don't exist**: Run `npm run db:push` to create/update tables
3. **Schema mismatch**: After adding new columns, always run `npm run db:push`

### Step 2: Run Database Migration

After schema changes (like adding `submitterWalletPubkey` columns), you must run:

```bash
npm run db:push
```

This updates your database schema to match `shared/schema.ts`.

### Step 3: Verify Database Connection

Check if your database is accessible:

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1;"
```

Or check the health endpoint:

```bash
curl http://localhost:5000/api/health
```

### Step 4: Check Specific Error

The server logs will show the exact error. Common ones:

- **"relation does not exist"** → Run `npm run db:push`
- **"connection refused"** → Check DATABASE_URL and PostgreSQL is running
- **"column does not exist"** → Schema mismatch, run `npm run db:push`
- **"permission denied"** → Check database user permissions

### Quick Fix Checklist

1. ✅ Set `DATABASE_URL` environment variable
2. ✅ Ensure PostgreSQL is running
3. ✅ Run `npm run db:push` after schema changes
4. ✅ Check server logs for specific error message
5. ✅ Verify database tables exist: `psql $DATABASE_URL -c "\dt"`

