import { useState, useEffect, useCallback } from "react";
import {
  WalletState,
  initialWalletState,
  connectWallet,
  disconnectWallet,
  authenticateWallet,
  checkWalletAccess,
  checkIsCreator,
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
  }, []);

  useEffect(() => {
    const checkExistingConnection = async () => {
      if (window.solana?.isConnected && window.solana?.publicKey) {
        const pk = window.solana.publicKey.toString();
        setWallet((prev) => ({
          ...prev,
          connected: true,
          publicKey: pk,
        }));

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

    checkExistingConnection();

    const handleConnect = () => {
      if (window.solana?.publicKey) {
        const pk = window.solana.publicKey.toString();
        setWallet((prev) => ({
          ...prev,
          connected: true,
          publicKey: pk,
        }));
      }
    };

    const handleDisconnect = () => {
      setWallet(initialWalletState);
    };

    const handleAccountChanged = () => {
      if (window.solana?.publicKey) {
        const pk = window.solana.publicKey.toString();
        setWallet((prev) => ({
          ...prev,
          connected: true,
          publicKey: pk,
          authenticated: false,
          hasAccess: false,
          isCreator: false,
        }));
      } else {
        setWallet(initialWalletState);
      }
    };

    if (window.solana) {
      window.solana.on("connect", handleConnect);
      window.solana.on("disconnect", handleDisconnect);
      window.solana.on("accountChanged", handleAccountChanged);
    }

    return () => {
      if (window.solana) {
        window.solana.off("connect", handleConnect);
        window.solana.off("disconnect", handleDisconnect);
        window.solana.off("accountChanged", handleAccountChanged);
      }
    };
  }, [refreshAccess]);

  return {
    wallet,
    loading,
    connect,
    disconnect,
    refreshAccess,
  };
}
