"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getModal, setupSelector, signOut } from "@/lib/wallet";

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
    let subscription: { unsubscribe: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const selector = await setupSelector();
        if (cancelled) return;
        const state = selector.store.getState();
        setAccountId(state.accounts[0]?.accountId ?? null);
        // The modal signs in outside React: follow the selector store.
        subscription = selector.store.observable.subscribe((next) => {
          setAccountId(next.accounts[0]?.accountId ?? null);
        });
      } catch (e) {
        console.log("Wallet not connected");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  const showModal = useCallback(async () => {
    const modal = await getModal();
    modal.show();
  }, []);

  const connect = useCallback(async () => {
    try {
      await showModal();
    } catch (e) {
      console.error("Failed to connect:", e);
    }
  }, [showModal]);

  const disconnect = useCallback(async () => {
    await signOut();
    setAccountId(null);
  }, []);

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
