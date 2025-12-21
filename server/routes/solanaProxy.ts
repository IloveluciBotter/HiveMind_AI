import { Request, Response } from "express";
import { logger } from "../middleware/logger";

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Whitelist of allowed read-only JSON-RPC methods
const ALLOWED_METHODS = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getLatestBlockhash",
  "getBlockHeight",
  "getVersion",
  "getProgramAccounts",
  "getTokenAccountBalance",
  "getBalance",
  "getSignaturesForAddress",
  "getSignatureStatuses",
  "getSlot", // Used for connection testing
  "getHealth", // Used for health checks
]);

const MAX_BODY_SIZE = 256 * 1024; // 256kb

export function registerSolanaProxyRoutes(app: any) {
  // POST /api/solana/rpc - Proxy Solana JSON-RPC requests
  app.post("/api/solana/rpc", async (req: Request, res: Response) => {
    const requestId = (req as any).requestId;

    try {
      // Check body size
      const contentLength = req.headers["content-length"];
      if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
        return res.status(413).json({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "Request body too large (max 256kb)",
          },
          id: null,
        });
      }

      // Validate JSON-RPC format
      const { method, params, id } = req.body;

      if (!method || typeof method !== "string") {
        return res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "Invalid request: missing or invalid 'method' field",
          },
          id: id || null,
        });
      }

      // Check if method is allowed (whitelist)
      if (!ALLOWED_METHODS.has(method)) {
        logger.warn({
          requestId,
          message: "Blocked unauthorized RPC method",
          method,
          ipHash: (req as any).ipHash,
        });
        return res.status(403).json({
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: `Method '${method}' is not allowed. Only read-only methods are permitted.`,
          },
          id: id || null,
        });
      }

      // Forward request to Solana RPC
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      try {
        const rpcResponse = await fetch(SOLANA_RPC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // API key is included in SOLANA_RPC_URL (e.g., Helius: https://.../?api-key=...)
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: id || null,
            method,
            params: params || [],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!rpcResponse.ok) {
          const errorText = await rpcResponse.text();
          logger.error({
            requestId,
            message: "Solana RPC error",
            status: rpcResponse.status,
            error: errorText,
            method,
          });
          return res.status(rpcResponse.status).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: `RPC error: ${rpcResponse.status} ${rpcResponse.statusText}`,
            },
            id: id || null,
          });
        }

        const data = await rpcResponse.json();
        
        // Forward the response (preserving JSON-RPC format)
        res.status(200).json(data);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === "AbortError") {
          logger.error({
            requestId,
            message: "Solana RPC timeout",
            method,
          });
          return res.status(504).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "RPC request timeout",
            },
            id: id || null,
          });
        }

        throw fetchError;
      }
    } catch (error: any) {
      logger.error({
        requestId,
        error: "Solana RPC proxy error",
        details: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: req.body?.id || null,
      });
    }
  });
}

