"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { setupSelector, getAccount, signOut } from "@/lib/wallet";

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  showModal: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    try {
      const account = await getAccount();
      setAccountId(account?.accountId || null);
    } catch (e) {
      console.log("Wallet not connected");
    } finally {
      setIsLoading(false);
    }
  }

  async function connect() {
    try {
      await showModal();
      await checkConnection();
    } catch (e) {
      console.error("Failed to connect:", e);
    }
  }

  async function showModal() {
    const { getModal } = await import("@/lib/wallet");
    const modal = await getModal();
    modal.show();
  }

  async function disconnect() {
    await signOut();
    setAccountId(null);
  }

  return (
    <WalletContext.Provider
      value={{
        accountId,
        isConnected: !!accountId,
        isLoading,
        connect,
        disconnect,
        showModal,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
