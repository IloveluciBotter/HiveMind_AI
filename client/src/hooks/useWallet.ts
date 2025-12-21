import { useState, useEffect, useCallback } from "react";
import {
  WalletState,
  initialWalletState,
  connectWallet,
  disconnectWallet,
  authenticateWallet,
  checkWalletAccess,
  checkIsCreator,
  checkSession,
} from "@/lib/wallet";

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>(initialWalletState);
  const [loading, setLoading] = useState(false);

  const refreshAccess = useCallback(async (publicKey: string) => {
    try {
      const access = await checkWalletAccess(publicKey);
      const isCreator = await checkIsCreator();
      setWallet((prev) => ({
        ...prev,
        hiveBalance: access.hiveAmount,
        requiredHive: access.requiredHiveAmount,
        hasAccess: access.hasAccess,
        isCreator,
      }));
    } catch (error) {
      console.error("Failed to refresh access:", error);
    }
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const result = await connectWallet();
      if (!result) {
        return false;
      }

      setWallet((prev) => ({
        ...prev,
        connected: true,
        publicKey: result.publicKey,
      }));

      const authenticated = await authenticateWallet(result.publicKey);
      if (authenticated) {
        setWallet((prev) => ({
          ...prev,
          authenticated: true,
        }));
        // Store public key for persistence (optional, session is primary)
        if (typeof window !== "undefined") {
          localStorage.setItem("wallet_publicKey", result.publicKey);
        }
        await refreshAccess(result.publicKey);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Connect error:", error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [refreshAccess]);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setWallet(initialWalletState);
    // Clear any stored wallet state
    if (typeof window !== "undefined") {
      localStorage.removeItem("wallet_publicKey");
    }
  }, []);

  useEffect(() => {
    const restoreWalletState = async () => {
      // First, check if we have a valid server session
      const session = await checkSession();
      
      if (session.authenticated && session.walletAddress) {
        // We have a valid session - restore wallet state
        const pk = session.walletAddress;
        
        // Try to connect to Phantom if available (but don't require it)
        let phantomConnected = false;
        if (window.solana?.isConnected && window.solana?.publicKey) {
          const phantomPk = window.solana.publicKey.toString();
          if (phantomPk === pk) {
            phantomConnected = true;
          }
        }
        
        setWallet((prev) => ({
          ...prev,
          connected: phantomConnected,
          publicKey: pk,
          authenticated: true,
        }));
        
        // Refresh access data
        await refreshAccess(pk);
        return;
      }
      
      // No valid session - check if Phantom is already connected
      if (window.solana?.isConnected && window.solana?.publicKey) {
        const pk = window.solana.publicKey.toString();
        setWallet((prev) => ({
          ...prev,
          connected: true,
          publicKey: pk,
        }));

        // Try to authenticate (will prompt for signature if needed)
        const authenticated = await authenticateWallet(pk);
        if (authenticated) {
          setWallet((prev) => ({
            ...prev,
            authenticated: true,
          }));
          await refreshAccess(pk);
        }
      }
    };

    restoreWalletState();

    const handleConnect = async () => {
      if (window.solana?.publicKey) {
        const pk = window.solana.publicKey.toString();
        
        // Check if we have a valid session for this wallet
        const session = await checkSession();
        if (session.authenticated && session.walletAddress === pk) {
          // Session matches - restore full state
          setWallet((prev) => ({
            ...prev,
            connected: true,
            publicKey: pk,
            authenticated: true,
          }));
          await refreshAccess(pk);
        } else {
          // No session or different wallet - just mark as connected
          setWallet((prev) => ({
            ...prev,
            connected: true,
            publicKey: pk,
          }));
          
          // Try to authenticate if we have a session for this wallet
          if (session.walletAddress === pk && !session.authenticated) {
            const authenticated = await authenticateWallet(pk);
            if (authenticated) {
              setWallet((prev) => ({
                ...prev,
                authenticated: true,
              }));
              await refreshAccess(pk);
            }
          }
        }
      }
    };

    const handleDisconnect = () => {
      // Only clear if user explicitly disconnected
      // Don't clear if we still have a valid session
      checkSession().then((session) => {
        if (!session.authenticated) {
          // No valid session, clear everything
          setWallet(initialWalletState);
          if (typeof window !== "undefined") {
            localStorage.removeItem("wallet_publicKey");
          }
        } else {
          // Still have valid session, just mark Phantom as disconnected
          setWallet((prev) => ({
            ...prev,
            connected: false,
          }));
        }
      });
    };

    const handleAccountChanged = async () => {
      if (window.solana?.publicKey) {
        const pk = window.solana.publicKey.toString();
        
        // Check if this matches our session
        const session = await checkSession();
        if (session.authenticated && session.walletAddress === pk) {
          // Same wallet, just update connection state
          setWallet((prev) => ({
            ...prev,
            connected: true,
            publicKey: pk,
            authenticated: true,
          }));
          await refreshAccess(pk);
        } else {
          // Different wallet or no session - need to re-authenticate
          setWallet((prev) => ({
            ...prev,
            connected: true,
            publicKey: pk,
            authenticated: false,
            hasAccess: false,
            isCreator: false,
          }));
          
          // Try to authenticate with new wallet
          const authenticated = await authenticateWallet(pk);
          if (authenticated) {
            setWallet((prev) => ({
              ...prev,
              authenticated: true,
            }));
            await refreshAccess(pk);
          }
        }
      } else {
        // No wallet selected - check if we still have a session
        const session = await checkSession();
        if (session.authenticated && session.walletAddress) {
          // Keep authenticated state, just mark as disconnected
          setWallet((prev) => ({
            ...prev,
            connected: false,
            publicKey: session.walletAddress,
            authenticated: true,
          }));
        } else {
          setWallet(initialWalletState);
        }
      }
    };

    if (window.solana) {
      window.solana.on("connect", handleConnect);
      window.solana.on("disconnect", handleDisconnect);
      window.solana.on("accountChanged", handleAccountChanged);
    }

    // Periodically check session validity (every 5 minutes)
    const sessionCheckInterval = setInterval(async () => {
      const session = await checkSession();
      if (!session.authenticated && wallet.authenticated) {
        // Session expired - clear authenticated state
        setWallet((prev) => ({
          ...prev,
          authenticated: false,
        }));
      } else if (session.authenticated && session.walletAddress && !wallet.authenticated) {
        // Session restored - update state
        const pk = session.walletAddress;
        setWallet((prev) => ({
          ...prev,
          publicKey: pk,
          authenticated: true,
        }));
        await refreshAccess(pk);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => {
      if (window.solana) {
        window.solana.off("connect", handleConnect);
        window.solana.off("disconnect", handleDisconnect);
        window.solana.off("accountChanged", handleAccountChanged);
      }
      clearInterval(sessionCheckInterval);
    };
  }, [refreshAccess, wallet.authenticated]);

  return {
    wallet,
    loading,
    connect,
    disconnect,
    refreshAccess,
  };
}
