# Solana RPC Proxy

## Overview

HiveMind uses a **secure RPC proxy** to prevent exposing Solana RPC API keys (like Helius) to the browser. All Solana read operations go through our backend proxy endpoint.

## Security Benefits

- ✅ **API keys stay server-side** - Never exposed to client code
- ✅ **Method whitelist** - Only read-only operations allowed
- ✅ **Rate limiting** - Controlled through our backend
- ✅ **Request size limits** - Prevents abuse (256kb max)

## How It Works

### Server-Side (`/api/solana/rpc`)

1. Accepts JSON-RPC requests from clients
2. Validates method is in whitelist (read-only only)
3. Forwards request to `SOLANA_RPC_URL` (with API key)
4. Returns response to client

### Client-Side

```typescript
import { createSolanaConnection } from "@/lib/solanaConnection";

const connection = createSolanaConnection();
// Uses: window.location.origin + "/api/solana/rpc"
```

## Allowed Methods (Whitelist)

Only these read-only methods are allowed:

- `getAccountInfo`
- `getMultipleAccounts`
- `getLatestBlockhash`
- `getBlockHeight`
- `getVersion`
- `getProgramAccounts`
- `getTokenAccountBalance`
- `getBalance`
- `getSignaturesForAddress`
- `getSignatureStatuses`
- `getSlot` (for connection testing)
- `getHealth` (for health checks)

All write operations (like `sendTransaction`) are blocked and must use Phantom wallet's RPC.

## Configuration

### Server Environment Variables

```env
# Required: Your Solana RPC endpoint (API key included in URL for Helius)
# Example for Helius:
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY

# For your setup, use:
# SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=41aa55a1-d85e-4bb8-887f-1938267b14e7
```

### Client Environment Variables

**No longer needed!** The client uses the proxy endpoint automatically.

~~`VITE_SOLANA_RPC_URL`~~ ← Remove this from your `.env`

## Write Operations (Transactions)

Write operations like `sendTransaction` are **NOT** proxied. They use:

1. **Phantom wallet's RPC** - When using `signAndSendTransaction()`
2. **Public RPC endpoints** - As fallback (if needed)

This is by design - transactions must be signed by the wallet, and Phantom handles sending them.

## Migration Notes

### Before (Unsecure)
```typescript
// ❌ API key exposed in client code
const connection = new Connection(
  import.meta.env.VITE_SOLANA_RPC_URL, // Contains API key!
  "confirmed"
);
```

### After (Secure)
```typescript
// ✅ API key stays server-side
import { createSolanaConnection } from "@/lib/solanaConnection";
const connection = createSolanaConnection();
```

## Testing

1. **Test proxy endpoint**:
   ```bash
   curl -X POST http://localhost:5000/api/solana/rpc \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}'
   ```

2. **Test blocked method** (should return 403):
   ```bash
   curl -X POST http://localhost:5000/api/solana/rpc \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"sendTransaction","params":[]}'
   ```

## Troubleshooting

### Error: "Method 'X' is not allowed"
- The method you're trying to use is not in the whitelist
- Check if it's a read-only operation that should be added

### Error: "RPC error: 403"
- Check your `SOLANA_RPC_URL` is correct
- Verify API key is valid in the URL
- Check Helius dashboard for rate limits

### Error: "Request body too large"
- Reduce the size of your request (max 256kb)
- Break large requests into multiple smaller ones

