# Token Gate Implementation Summary

## Files Changed/Added

### Server Files

#### 1. `server/solana.ts` (NEW)
- **Purpose**: Helper module for checking HIVE token balance on Solana
- **Functions**:
  - `getHiveBalance(walletAddress)`: Fetches total HIVE token balance for a wallet using `getParsedTokenAccountsByOwner`
- **Uses**: `@solana/web3.js` Connection API
- **Environment Variables**: `SOLANA_RPC_URL`, `HIVE_MINT`

#### 2. `server/jupiter.ts` (NEW)
- **Purpose**: Helper module for fetching HIVE token USD price from Jupiter Price API
- **Functions**:
  - `getHivePrice()`: Fetches current USD price from Jupiter, with 60-second cache
  - `clearPriceCache()`: Utility to clear cache (for testing)
- **Uses**: Jupiter Price API v4
- **Caching**: In-memory cache with 60-second TTL

#### 3. `server/auth.ts` (NEW)
- **Purpose**: Authentication and authorization middleware using JWT and Solana signatures
- **Functions**:
  - `generateNonce()`: Creates random nonce for challenge
  - `storeNonce()` / `verifyNonce()`: Manages nonce storage (5-minute TTL)
  - `verifySignature()`: Verifies Solana ed25519 signatures using `tweetnacl`
  - `issueToken()` / `verifyToken()`: JWT token management
  - `requireAuth()`: Express middleware to require authentication
  - `checkHiveAccess()`: Checks if wallet has ≥$1 USD of HIVE (with 60-second cache)
  - `requireHiveAccess()`: Express middleware to require HIVE access
- **Uses**: `jsonwebtoken`, `tweetnacl`, `@solana/web3.js`
- **Environment Variables**: `JWT_SECRET`, `MIN_USD_ACCESS`

#### 4. `server/index.ts` (MODIFIED)
- **Changes**: Added `cookie-parser` middleware to parse HTTP-only cookies
- **Purpose**: Enables JWT token storage in httpOnly cookies

#### 5. `server/routes.ts` (MODIFIED)
- **New Endpoints**:
  - `GET /api/auth/challenge?publicKey=...`: Returns nonce for wallet signature challenge
  - `POST /api/auth/verify`: Verifies signature and issues JWT cookie
  - `GET /api/gate/status`: Returns HIVE access status (requires auth)
- **Protected Routes** (now require `requireAuthMiddleware` + `requireHiveAccess`):
  - `POST /api/train-attempts/submit`: Training submission
  - `POST /api/hub/submit`: Hub post submission
- **Note**: `/api/chat/*` routes don't exist in the codebase, so they weren't protected

### Client Files

#### 6. `client/src/lib/solanaWallet.ts` (MODIFIED)
- **New Functions**:
  - `signMessage(message)`: Signs a message using Phantom wallet's `signMessage` API
  - `authenticateWithServer(publicKey)`: Complete auth flow (challenge → sign → verify)
  - `checkGateStatus()`: Checks HIVE access status from server
- **Updated Interface**: Added `signMessage` to `PhantomProvider` type
- **Uses**: Phantom's injected `window.solana.signMessage()` API

#### 7. `client/src/components/game/WalletButton.tsx` (MODIFIED)
- **Changes**: 
  - Added `onGateStatusChange` prop
  - Automatically authenticates with server after wallet connection
  - Checks gate status and notifies parent component
- **Flow**: Connect → Authenticate → Check Gate → Notify

#### 8. `client/src/components/game/TopBar.tsx` (MODIFIED)
- **Changes**:
  - Added `hasHiveAccess` and `onGateStatusChange` props
  - Updated status badge to show HIVE access instead of token balance
  - Shows "Need $1+ USD worth of $HIVE" message when blocked
- **UI**: Green badge for access, red badge for blocked

#### 9. `client/src/components/game/GameContainer.tsx` (MODIFIED)
- **Changes**:
  - Added `hasHiveAccess` state
  - Added `handleGateStatusChange` callback
  - Passes gate status to `TopBar` and `WalletButton`
  - Checks gate status after wallet connection

### Package Dependencies Added

- `jsonwebtoken` + `@types/jsonwebtoken`: JWT token management
- `@solana/web3.js`: Solana blockchain interaction
- `tweetnacl`: Ed25519 signature verification
- `cookie-parser` + `@types/cookie-parser`: HTTP cookie parsing

## Environment Variables Required

Set these environment variables on your hosting platform:

```bash
# Required: HIVE token mint address
HIVE_MINT=F3zvEFZVhDXNo1kZDPg24Z3RioDzCdEJVdnZ5FCcpump

# Required: Solana RPC endpoint (defaults to mainnet public RPC if not set)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Required: Minimum USD value required for access (defaults to 1)
MIN_USD_ACCESS=1

# Required: Secret key for JWT signing (CHANGE THIS IN PRODUCTION!)
JWT_SECRET=your-secret-key-here-change-in-production

# Optional: Server port (defaults to 5000)
PORT=5000

# Existing: Database connection (already required)
DATABASE_URL=postgres://...
```

## How It Works

### Authentication Flow

1. **User connects wallet** → Phantom wallet connects
2. **Client requests challenge** → `GET /api/auth/challenge?publicKey=...`
3. **Server returns nonce** → Random nonce stored with 5-minute TTL
4. **Client signs message** → User signs "Sign this message to authenticate: {nonce}" with Phantom
5. **Client verifies** → `POST /api/auth/verify` with signature
6. **Server verifies signature** → Uses `tweetnacl` to verify ed25519 signature
7. **Server issues JWT** → Sets httpOnly cookie with 7-day expiration

### Gate Check Flow

1. **Client requests gate status** → `GET /api/gate/status` (requires auth cookie)
2. **Server checks balance** → Fetches HIVE balance from Solana (cached 60s)
3. **Server fetches price** → Gets USD price from Jupiter (cached 60s)
4. **Server calculates access** → `hiveUsd >= MIN_USD_ACCESS` (or `hiveAmount >= 1` if price missing)
5. **Server returns status** → `{ hasAccess, hiveAmount, hiveUsd, priceUsd, priceMissing }`

### Protected Routes

- `POST /api/train-attempts/submit`: Returns `403 { error: "HIVE_REQUIRED" }` if access denied
- `POST /api/hub/submit`: Returns `403 { error: "HIVE_REQUIRED" }` if access denied

## Testing

1. **Set environment variables** (see above)
2. **Start server**: `npm run dev`
3. **Connect wallet** in browser
4. **Check gate status**: Should see access status in TopBar
5. **Try protected route**: Should be blocked if insufficient HIVE

## Notes

- **Caching**: Both balance and price are cached for 60 seconds to reduce RPC/API calls
- **Fallback**: If Jupiter price is unavailable, falls back to checking if balance ≥ 1 HIVE
- **Security**: JWT tokens are stored in httpOnly cookies (not accessible to JavaScript)
- **Nonce TTL**: Challenge nonces expire after 5 minutes
- **Token TTL**: JWT tokens expire after 7 days

