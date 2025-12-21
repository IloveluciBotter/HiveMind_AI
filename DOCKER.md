# Docker Setup Guide

This guide covers running HiveMind using Docker Compose for local development and production deployment.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2.0+
- `.env` file with required environment variables

## Quick Start

### First Run

1. **Create `.env` file** (if not exists):
   ```bash
   cp .env.example .env
   ```

2. **Set required environment variables** in `.env`:
   ```env
   # Database (used by docker-compose.yml)
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=your_secure_password
   POSTGRES_DB=hivemind
   POSTGRES_PORT=5432

   # Application
   DATABASE_URL=postgresql://postgres:your_secure_password@postgres:5432/hivemind
   PORT=5000
   NODE_ENV=production

   # CORS (optional - defaults to PUBLIC_APP_DOMAIN)
   ALLOWED_ORIGINS=http://localhost:5000,https://yourdomain.com
   # OR
   PUBLIC_APP_DOMAIN=yourdomain.com

   # Solana
   SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
   HIVE_MINT=YOUR_HIVE_MINT_ADDRESS

   # AI Services (optional)
   LMSTUDIO_BASE_URL=http://host.docker.internal:1234/v1
   LMSTUDIO_MODEL=mistralai/mistral-7b-instruct-v0.3

   # Other required vars...
   ```

3. **Start all services**:
   ```bash
   npm run docker:up
   ```
   Or manually:
   ```bash
   docker compose up --build
   ```

4. **Run database migrations**:
   ```bash
   npm run docker:db:push
   ```
   Or manually:
   ```bash
   docker compose exec app npm run db:push
   ```

5. **Seed initial data** (optional):
   ```bash
   npm run docker:seed
   ```
   Or manually:
   ```bash
   docker compose exec app npm run seed
   ```

6. **Access the application**:
   - Web UI: http://localhost:5000
   - Health Check: http://localhost:5000/api/health
   - Database: localhost:5432 (if exposed)

## Available Commands

### Start Services
```bash
npm run docker:up
# or
docker compose up --build
```

### Stop Services
```bash
npm run docker:down
# or
docker compose down
```

### View Logs
```bash
npm run docker:logs
# or
docker compose logs -f

# View specific service logs
docker compose logs -f app
docker compose logs -f postgres
```

### Access Container Shell
```bash
npm run docker:shell
# or
docker compose exec app sh
```

### Run Commands in Container
```bash
# Database migrations
npm run docker:db:push
# or
docker compose exec app npm run db:push

# Seed database
npm run docker:seed
# or
docker compose exec app npm run seed

# Run any npm script
docker compose exec app npm run <script-name>
```

## Database Management

### Reset Database (Delete All Data)

**⚠️ WARNING: This deletes all data!**

```bash
# Stop services
docker compose down

# Remove volume
docker compose down -v

# Or manually remove volume
docker volume rm hivemind_postgres-data

# Start fresh
docker compose up --build
```

### Backup Database

```bash
# Create backup
docker compose exec postgres pg_dump -U postgres hivemind > backup.sql

# Restore from backup
docker compose exec -T postgres psql -U postgres hivemind < backup.sql
```

### Access Database Directly

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U postgres -d hivemind

# Or from host (if port exposed)
psql -h localhost -p 5432 -U postgres -d hivemind
```

## Environment Variables

### Required Variables

- `DATABASE_URL`: PostgreSQL connection string (must use `postgres` hostname in Docker)
- `PORT`: Application port (default: 5000)
- `NODE_ENV`: Set to `production` in Docker

### Database Variables (for docker-compose.yml)

- `POSTGRES_USER`: Database user (default: postgres)
- `POSTGRES_PASSWORD`: Database password
- `POSTGRES_DB`: Database name (default: hivemind)
- `POSTGRES_PORT`: External port mapping (default: 5432)

### CORS Configuration

Set one of:
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins
  ```
  ALLOWED_ORIGINS=http://localhost:5000,https://app.example.com
  ```
- `PUBLIC_APP_DOMAIN`: Single domain (will allow both http and https)
  ```
  PUBLIC_APP_DOMAIN=app.example.com
  ```

If neither is set, CORS will be permissive in development mode only.

### AI Services (Optional)

For local LM Studio:
```
LMSTUDIO_BASE_URL=http://host.docker.internal:1234/v1
LMSTUDIO_MODEL=mistralai/mistral-7b-instruct-v0.3
```

**Note**: `host.docker.internal` allows the container to access services on the host machine (Windows/Mac). On Linux, you may need to use the host's IP address.

## Troubleshooting

### Container Won't Start

1. **Check logs**:
   ```bash
   docker compose logs app
   ```

2. **Verify .env file exists** and has required variables

3. **Check port conflicts**:
   ```bash
   # Windows PowerShell
   netstat -ano | findstr :5000
   
   # Linux/Mac
   lsof -i :5000
   ```

### Database Connection Errors

1. **Verify DATABASE_URL uses `postgres` hostname** (not `localhost`):
   ```
   DATABASE_URL=postgresql://postgres:password@postgres:5432/hivemind
   ```

2. **Check database is healthy**:
   ```bash
   docker compose ps
   # Should show postgres as "healthy"
   ```

3. **Check database logs**:
   ```bash
   docker compose logs postgres
   ```

### Build Failures

1. **Clear Docker cache**:
   ```bash
   docker compose build --no-cache
   ```

2. **Check Dockerfile syntax**:
   ```bash
   docker build -t hivemind-test .
   ```

### Permission Errors (Linux)

If you get permission errors, you may need to:
```bash
sudo chown -R $USER:$USER .
```

### Windows-Specific Issues

1. **Line endings**: Ensure `.env` file uses LF line endings (not CRLF)
2. **Volume mounts**: Docker Desktop handles this automatically
3. **WSL2**: If using WSL2, ensure Docker Desktop is configured to use WSL2 backend

## Production Deployment

### Building for Production

The Dockerfile uses multi-stage builds:
1. **deps**: Installs all dependencies
2. **client-builder**: Builds React client
3. **server-builder**: Builds Node.js server
4. **production**: Final minimal image with only production dependencies

### Security Considerations

1. **Never commit `.env` file** - it's in `.gitignore`
2. **Use secrets management** in production (Docker secrets, Kubernetes secrets, etc.)
3. **Run as non-root user** - Dockerfile already does this
4. **Keep images updated** - Regularly rebuild with latest base images

### Scaling

For production scaling:

1. **Use external database** (managed PostgreSQL service)
2. **Add Redis** for session storage and caching
3. **Use load balancer** in front of multiple app instances
4. **Configure health checks** (already included)

Example docker-compose override for production:
```yaml
# docker-compose.prod.yml
services:
  app:
    environment:
      - DATABASE_URL=${EXTERNAL_DATABASE_URL}
    # Remove postgres service dependency
    # Add Redis service
```

## Health Checks

Both services have health checks configured:

- **App**: `GET /api/health` (returns 200 when healthy)
- **Postgres**: `pg_isready` command

Check health status:
```bash
docker compose ps
```

## Network Configuration

Services communicate on the `hivemind-network` bridge network:
- App can reach postgres at `postgres:5432`
- External access via published ports

## Volume Persistence

Database data is persisted in Docker volume `postgres-data`:
- Survives container restarts
- Survives `docker compose down` (but not `docker compose down -v`)
- Located at Docker's volume storage (varies by OS)

Find volume location:
```bash
docker volume inspect hivemind_postgres-data
```

## Next Steps

After Docker setup:
1. Run migrations: `npm run docker:db:push`
2. Seed data: `npm run docker:seed`
3. Access app: http://localhost:5000
4. Configure CORS for your domain
5. Set up monitoring and logging

