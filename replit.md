# Train Your AI - Quiz Game

## Overview

A gamified AI training quiz game where users answer multiple-choice questions to make their virtual AI companion smarter or dumber based on performance. The game features an unlimited level progression system, Solana wallet integration with token-gating, and persistent state via localStorage. Built with a modern dark-themed UI inspired by gamified learning apps like Duolingo and Habitica.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom plugins for Replit integration
- **Styling**: Tailwind CSS with CSS custom properties for theming (dark mode default)
- **UI Components**: shadcn/ui component library (Radix UI primitives + Tailwind)
- **State Management**: React hooks with localStorage persistence for game state
- **Data Fetching**: TanStack React Query for API calls

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **Build**: esbuild for production bundling with selective dependency bundling
- **Static Serving**: Express serves Vite-built frontend from `dist/public`
- **Authentication**: Secure nonce-based Solana wallet authentication with server-side sessions
  - Domain-bound message format prevents cross-domain replay attacks
  - Atomic nonce consumption prevents concurrent verification exploits
  - Session tokens stored as SHA-256 hashes in PostgreSQL
  - 7-day session expiry with httpOnly cookies
- **Rate Limiting**: Per-endpoint rate limits (IP-based for unauthenticated, wallet-based for authenticated)
  - Auth nonce/verify: 10/min/IP
  - Public read endpoints: 60/min/IP
  - Chat: 30/min/wallet + 60/min/IP
  - Submissions: 60/min/wallet
  - Corpus/review: 20/min/wallet
- **Structured Logging**: JSON logs via pino with request IDs, wallet addresses, and IP hashes
- **Audit Logging**: Database table tracking sensitive actions (logins, submissions, reviews, corpus changes, admin actions)
- **Health Monitoring**: `/api/health` aggregated status, `/api/health/ready` for readiness, `/api/health/live` for liveness
- **Error Tracking**: Sentry integration (optional, requires `SENTRY_DSN`)
- **AI Fallback Control**: `ALLOW_AI_FALLBACK` controls fallback behavior (default: false in production)

### Data Storage
- **Game State**: localStorage for client-side persistence (intelligence level, scores, sessions)
- **Database Schema**: PostgreSQL with Drizzle ORM (users table defined, ready for expansion)
- **Schema Location**: `shared/schema.ts` with Zod validation via drizzle-zod

### Key Design Patterns
- **Screen-based Navigation**: Single-page app with show/hide screens (home, training, result)
- **Component Composition**: Game components in `client/src/components/game/`, UI primitives in `client/src/components/ui/`
- **Shared Code**: `shared/` directory for code used by both client and server
- **Path Aliases**: `@/` for client source, `@shared/` for shared code

### Game Mechanics
- **Scoring Rules**: Pass thresholds scale by level (70% for L1-10, 80% for L11-20, 90% for L21+)
- **Unlimited Levels**: Dynamic difficulty scaling with no upper bound on currentLevel or maxUnlockedLevel
- **Question System**: 50 questions with complexity ratings (1-5), selected based on current level
- **Level Selection**: Players can choose any unlocked level (1 to maxUnlockedLevel)
- **AI Chat**: Intelligence-based responses that vary with intelligenceLevel (basic to elite)

### RAG (Retrieval Augmented Generation)
- **Vector Search**: pgvector-enabled database with 768-dimension embeddings using cosine similarity
- **Text Chunking**: 1000 character chunks with 200 character overlap for long corpus items
- **Embedding Service**: Ollama API with gemma3:4b model (configurable via OLLAMA_EMBED_MODEL)
- **Source Grounding**: AI chat responses include `isGrounded` flag and `sources` array with similarity scores
- **Approval Workflow**: Corpus items are embedded automatically when approved by admin
- **Endpoints**:
  - `POST /api/rag/search` - Vector similarity search with query, k, and optional trackId
  - `POST /api/rag/embed/:id` - Manually embed a corpus item (admin only)
  - `POST /api/corpus/:id/approve` - Approve and auto-embed corpus item (admin only)

### Auto-Review System
- **Perfect Score Rule**: 100% accuracy + 30s+ duration = auto-approve
- **Low Score Rule**: ≤40% accuracy = auto-reject
- **Pending Review**: Scores between 40-100% go to manual review queue
- **Environment Variables**: AUTO_REVIEW_ENABLED (default true), AUTO_REVIEW_MIN_DURATION_SEC (default 30)

### Training Stake Economy
- **Stake System**: Users deposit HIVE tokens to a vault and receive internal stake balance
- **On-Chain Verification**: Deposits are verified via Solana RPC to prevent fraud
  - Validates transaction exists and succeeded
  - Confirms transfer destination is the configured vault
  - Verifies token mint matches HIVE token (supports SPL Token and Token-2022)
  - Ensures sender wallet matches authenticated user
- **Fee Reserve/Settle**: Training fees are reserved upfront and settled based on score
  - Perfect score (100%): 0% cost (full refund)
  - Pass (≥70%): Partial cost scaled by performance
  - Fail (<70%): 100% cost
- **Difficulty Fees**: Fees scale by difficulty (low: 0.5x, medium: 1x, high: 2x, extreme: 4x base fee)
- **Rewards Pool**: Failed training fees route to rewards pool for distribution
- **Settlement Transaction Invariants** (server/services/settlement.ts):
  - All operations wrapped in `db.transaction()` for atomic commit/rollback
  - `SELECT FOR UPDATE` on wallet_balances row prevents concurrent settlements
  - Unique index on stake_ledger (attempt_id, reason) prevents duplicate entries
  - Preflight checks detect already-settled attempts and return early
  - `ON CONFLICT DO NOTHING` on ledger inserts provides defense-in-depth
- **Database Tables**: wallet_balances, stake_ledger, rewards_pool
- **Environment Variables**:
  - ECON_BASE_FEE_HIVE: Base fee amount (default: 1)
  - ECON_PASS_THRESHOLD: Pass threshold (default: 0.7)
  - ECON_MIN_PARTIAL_COST_PCT: Minimum cost for partial pass (default: 0.2)
  - HIVE_VAULT_ADDRESS: Vault address for deposits
  - HIVE_MINT: HIVE token mint address
  - REWARDS_WALLET_ADDRESS: Address for rewards distribution

### Learning Telemetry Pipeline
- **Answer Events**: Raw training telemetry logged per question answered (expires after retention period)
  - Tracks wallet, attempt, track, question, selected answer, correctness
  - Includes score, duration, level, auto-decision, and cycle number
- **Aggregates**: Rolled up stats computed every 15 minutes (kept forever)
  - question_aggregates: Per-question accuracy, attempt counts, average duration
  - track_aggregates: Per-track accuracy and attempt counts
  - cycle_aggregates: Per-cycle accuracy and attempt counts
- **Retention Cleanup**: Runs every 24 hours, deletes events older than ANSWER_EVENTS_RETENTION_DAYS (default: 60)
- **Stats Endpoints**:
  - `GET /api/stats/tracks` - Track-level aggregate stats
  - `GET /api/stats/questions?trackId=...` - Question-level stats optionally filtered by track
  - `GET /api/stats/cycle/current` - Current cycle stats
  - `GET /api/stats/cycles` - All cycle stats
- **Environment Variables**:
  - ANSWER_EVENTS_RETENTION_DAYS: Days to keep raw events (default: 60)

### Cosmetics System
- **Style Credits**: Cosmetic-only currency (starts at 200)
  - Earn +20 credits for 90%+ session score
  - Earn +10 credits for 70-89% session score
  - Persisted to localStorage
- **Avatar Skins** (3 total):
  - Default Core (free) - emoji changes by intelligence level
  - Glitched Core (100 credits) - glitch animation effect
  - Overclocked Core (200 credits) - fire/heat animation effect
- **Aura Styles** (3 total):
  - Neon Blue Aura (50 credits) - blue glow
  - Neon Purple Aura (75 credits) - purple glow
  - Neon Green Aura (100 credits) - green glow
- **Shop UI**: Accessible from home screen, buy/equip cosmetics
- **State**: ownedSkins, ownedAuras, equippedSkin, equippedAura saved to localStorage

## External Dependencies

### Blockchain Integration
- **Solana Wallet**: Phantom wallet integration via window.solana provider (no external SDK)
- **Token Gating**: $MEME token balance check required (50 tokens minimum) to start training
- **RPC Endpoint**: Solana mainnet-beta API

### Database
- **PostgreSQL**: Required via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM with drizzle-kit for migrations

### Environment Variables (New in Phase 3)
- `SENTRY_DSN`: Sentry DSN for error tracking (optional)
- `SENTRY_ENVIRONMENT`: Sentry environment (dev/staging/prod)
- `VITE_SENTRY_DSN`: Frontend Sentry DSN
- `VITE_SENTRY_ENVIRONMENT`: Frontend Sentry environment
- `ALLOW_AI_FALLBACK`: Allow AI fallback responses (default: false in production, true in development)

### UI/Design
- **Fonts**: DM Sans, Fira Code, Geist Mono via Google Fonts
- **Icons**: Lucide React
- **Component Primitives**: Full Radix UI suite (dialog, dropdown, toast, etc.)

### Key NPM Packages
- `@tanstack/react-query`: Server state management
- `drizzle-orm` + `drizzle-zod`: Database ORM with validation
- `class-variance-authority` + `clsx` + `tailwind-merge`: Styling utilities
- `react-hook-form` + `@hookform/resolvers`: Form handling
- `vaul`: Drawer component
- `embla-carousel-react`: Carousel functionality