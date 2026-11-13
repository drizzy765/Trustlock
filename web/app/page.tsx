"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { initNear, isSignedIn, getAccountId } from "@/lib/near";

export default function HomePage() {
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    initNear().then(() => {
      setAccountId(getAccountId());
    });
  }, []);

  return (
    <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <p style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 12, color: "#888" }}>TrustLock</p>
        <h1 style={{ fontSize: 36, margin: "16px 0" }}>Pay on delivery.<br />The rider is the proof.</h1>
        <p style={{ fontSize: 18, color: "#888", maxWidth: 600, margin: "0 auto" }}>
          The buyer locks USDC on NEAR. The dispatch rider scans a one-time QR. 
          The seller is paid instantly. The AI writes the deal — it cannot move funds.
        </p>
      </div>

      {/* Role Selection */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(3, 1fr)", 
        gap: 16,
        marginBottom: 48
      }}>
        {/* Buyer Card */}
        <Link href="/pay" style={{ textDecoration: "none" }}>
          <div style={{ 
            background: "#1a1a1a", 
            padding: 24, 
            borderRadius: 8,
            border: "1px solid #333",
            textAlign: "center",
            cursor: "pointer",
            transition: "border-color 0.2s"
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🛒</div>
            <h3 style={{ margin: "8px 0" }}>Buyer</h3>
            <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
              Lock funds in escrow
            </p>
          </div>
        </Link>

        {/* Seller Card */}
        <Link href="/seller/onboard" style={{ textDecoration: "none" }}>
          <div style={{ 
            background: "#1a1a1a", 
            padding: 24, 
            borderRadius: 8,
            border: "2px solid #22c55e",
            textAlign: "center",
            cursor: "pointer",
            position: "relative"
          }}>
            <div style={{ 
              position: "absolute",
              top: -10,
              right: -10,
              background: "#22c55e",
              color: "#000",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: "bold"
            }}>
              NEW
            </div>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🏪</div>
            <h3 style={{ margin: "8px 0" }}>Seller</h3>
            <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
              Create deal & get paid
            </p>
          </div>
        </Link>

        {/* Rider Card */}
        <Link href="/scan" style={{ textDecoration: "none" }}>
          <div style={{ 
            background: "#1a1a1a", 
            padding: 24, 
            borderRadius: 8,
            border: "1px solid #333",
            textAlign: "center",
            cursor: "pointer"
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🛵</div>
            <h3 style={{ margin: "8px 0" }}>Rider</h3>
            <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
              Confirm delivery
            </p>
          </div>
        </Link>
      </div>

      {/* Dashboard Link */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <Link 
          href="/dashboard" 
          style={{ 
            color: "#3b82f6", 
            textDecoration: "none",
            fontSize: 16
          }}
        >
          📊 View Dashboard →
        </Link>
      </div>

      {/* Status */}
      <div style={{ 
        background: "#1a1a1a", 
        padding: 16, 
        borderRadius: 8,
        border: "1px solid #333",
        fontSize: 12,
        color: "#888",
        textAlign: "center"
      }}>
        {accountId ? (
          <span>Connected: <strong>{accountId}</strong></span>
        ) : (
          <span>Connect wallet to start</span>
        )}
        <br /><br />
        <strong>Contract:</strong> trustlock-timi.testnet (testnet) | 
        <strong> Mode badge:</strong> demo / dry / live (live only after a real execute)
      </div>
    </main>
  );
}

