# Multi-stage Dockerfile for HiveMind
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files (package-lock.json may not exist)
COPY package*.json ./

# Install dependencies (use npm ci if lockfile exists, otherwise npm install)
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi

# Stage 2: Build client
FROM node:20-alpine AS client-builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Copy client source and config files
COPY client ./client
COPY shared ./shared
COPY vite.config.ts tsconfig.json tailwind.config.ts postcss.config.js ./
COPY components.json ./

# Build client (Vite outputs to dist/public per vite.config.ts)
RUN npx vite build

# Stage 3: Build server
FROM node:20-alpine AS server-builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Copy server source and build script
COPY server ./server
COPY shared ./shared
COPY script ./script
COPY tsconfig.json drizzle.config.ts vite.config.ts ./

# Copy built client to dist/public
COPY --from=client-builder /app/dist/public ./dist/public

# Build server only (client already built in client-builder stage)
RUN npm run build:server

# Stage 4: Production runtime
FROM node:20-alpine AS production
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi && npm cache clean --force

# Copy built artifacts (includes dist/index.cjs and dist/public/)
COPY --from=server-builder /app/dist ./dist
COPY --from=server-builder /app/package.json ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start server
CMD ["node", "dist/index.cjs"]

