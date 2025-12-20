import { api } from "./api";

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
      signMessage: (
        message: Uint8Array,
        encoding: string
      ) => Promise<{ signature: Uint8Array }>;
      signTransaction: <T>(transaction: T) => Promise<T>;
      signAndSendTransaction: <T>(transaction: T) => Promise<{ signature: string }>;
      publicKey?: { toString: () => string };
      isConnected?: boolean;
      on: (event: string, callback: () => void) => void;
      off: (event: string, callback: () => void) => void;
    };
  }
}

export interface WalletState {
  connected: boolean;
  publicKey: string | null;
  authenticated: boolean;
  hiveBalance: number;
  requiredHive: number;
  hasAccess: boolean;
  isCreator: boolean;
}

export const initialWalletState: WalletState = {
  connected: false,
  publicKey: null,
  authenticated: false,
  hiveBalance: 0,
  requiredHive: 50,
  hasAccess: false,
  isCreator: false,
};

export async function connectWallet(): Promise<{
  publicKey: string;
} | null> {
  if (!window.solana?.isPhantom) {
    window.open("https://phantom.app/", "_blank");
    return null;
  }

  try {
    const response = await window.solana.connect();
    return { publicKey: response.publicKey.toString() };
  } catch (error) {
    console.error("Wallet connect error:", error);
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  try {
    await api.auth.logout();
  } catch (error) {
    console.error("Logout error:", error);
  }
  if (window.solana) {
    await window.solana.disconnect();
  }
}

export async function authenticateWallet(
  publicKey: string
): Promise<boolean> {
  try {
    const { nonce, message } = await api.auth.getNonce(publicKey);

    const encodedMessage = new TextEncoder().encode(message);

    if (!window.solana) {
      throw new Error("Wallet not connected");
    }

    const { signature } = await window.solana.signMessage(
      encodedMessage,
      "utf8"
    );

    const signatureBase64 = btoa(
      String.fromCharCode.apply(null, Array.from(new Uint8Array(signature)))
    );

    const result = await api.auth.verify(publicKey, signatureBase64, nonce);

    return result.ok === true;
  } catch (error) {
    console.error("Authentication error:", error);
    return false;
  }
}

export async function checkSession(): Promise<{
  authenticated: boolean;
  walletAddress: string | null;
}> {
  try {
    const result = await api.auth.session();
    return {
      authenticated: result.authenticated,
      walletAddress: result.walletAddress,
    };
  } catch {
    return { authenticated: false, walletAddress: null };
  }
}

export async function checkWalletAccess(publicKey: string): Promise<{
  hasAccess: boolean;
  hiveAmount: number;
  requiredHiveAmount: number;
}> {
  try {
    const result = await api.gate.checkBalance(publicKey);
    return {
      hasAccess: result.hasAccess,
      hiveAmount: result.hiveAmount,
      requiredHiveAmount: result.requiredHiveAmount,
    };
  } catch (error) {
    console.error("Access check error:", error);
    return { hasAccess: false, hiveAmount: 0, requiredHiveAmount: 50 };
  }
}

export async function checkIsCreator(): Promise<boolean> {
  try {
    const result = await api.auth.isCreator();
    return result.isCreator;
  } catch {
    return false;
  }
}
