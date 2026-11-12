"use client";

import { useWallet } from "@/lib/wallet-provider";
import { contractId } from "@/lib/config";
import { useState, useEffect } from "react";

// Mock data for demo
const MOCK_DEALS = [
  {
    deal_id: 1,
    seller_id: "seller.testnet",
    buyer_id: "buyer.testnet",
    item: "black sandal",
    price_ngn: 2500,
    status: "Funded",
    created_at: "2024-11-12",
    explorer_link: "https://testnet.nearblocks.io/txns/ABC123",
  },
  {
    deal_id: 2,
    seller_id: "seller.testnet",
    buyer_id: "buyer2.testnet",
    item: "iPhone charger",
    price_ngn: 5000,
    status: "Released",
    created_at: "2024-11-11",
    explorer_link: "https://testnet.nearblocks.io/txns/DEF456",
  },
  {
    deal_id: 3,
    seller_id: "seller.testnet",
    buyer_id: "buyer3.testnet",
    item: "wristwatch",
    price_ngn: 15000,
    status: "Disputed",
    created_at: "2024-11-10",
    explorer_link: null,
  },
];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Created: { bg: "#374151", color: "#9ca3af" },
  Funded: { bg: "#1e3a8a", color: "#60a5fa" },
  Delivered: { bg: "#3f6212", color: "#a3e635" },
  Released: { bg: "#064e3b", color: "#22c55e" },
  Refunded: { bg: "#7c2d12", color: "#fb923c" },
  Disputed: { bg: "#7f1d1d", color: "#ef4444" },
  Expired: { bg: "#374151", color: "#6b7280" },
};

export default function DashboardPage() {
  const { accountId, isConnected, showModal } = useWallet();
  const [deals, setDeals] = useState(MOCK_DEALS);
  const [filter, setFilter] = useState("all");

  const filteredDeals = filter === "all" 
    ? deals 
    : deals.filter(d => d.status.toLowerCase() === filter);

  const stats = {
    total: deals.length,
    funded: deals.filter(d => d.status === "Funded").length,
    released: deals.filter(d => d.status === "Released").length,
    disputed: deals.filter(d => d.status === "Disputed").length,
  };

  return (
    <main style={{ padding: 32, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Seller Dashboard</h1>
        {isConnected ? (
          <span style={{ color: "#888" }}>Account: <strong>{accountId}</strong></span>
        ) : (
          <button 
            onClick={showModal}
            style={{
              background: "#22c55e",
              color: "#000",
              border: "none",
              padding: "8px 16px",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Connect Wallet
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(4, 1fr)", 
        gap: 16,
        marginBottom: 32
      }}>
        <StatCard label="Total Deals" value={stats.total} />
        <StatCard label="Funded" value={stats.funded} color="#60a5fa" />
        <StatCard label="Released" value={stats.released} color="#22c55e" />
        <StatCard label="Disputed" value={stats.disputed} color="#ef4444" />
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        {["all", "funded", "released", "disputed"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #333",
              background: filter === f ? "#3b82f6" : "#1a1a1a",
              color: "#fff",
              cursor: "pointer",
              textTransform: "capitalize",
              fontSize: 14,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Deals Table */}
      <div style={{ 
        background: "#1a1a1a", 
        borderRadius: 8, 
        border: "1px solid #333",
        overflow: "hidden"
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#111", borderBottom: "1px solid #333" }}>
              <th style={{ padding: 12, textAlign: "left", fontSize: 12, color: "#888" }}>ID</th>
              <th style={{ padding: 12, textAlign: "left", fontSize: 12, color: "#888" }}>Item</th>
              <th style={{ padding: 12, textAlign: "left", fontSize: 12, color: "#888" }}>Price</th>
              <th style={{ padding: 12, textAlign: "left", fontSize: 12, color: "#888" }}>Status</th>
              <th style={{ padding: 12, textAlign: "left", fontSize: 12, color: "#888" }}>Date</th>
              <th style={{ padding: 12, textAlign: "left", fontSize: 12, color: "#888" }}>Explorer</th>
            </tr>
          </thead>
          <tbody>
            {filteredDeals.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#888" }}>
                  No deals found
                </td>
              </tr>
            ) : (
              filteredDeals.map((deal) => (
                <tr key={deal.deal_id} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: 12 }}>#{deal.deal_id}</td>
                  <td style={{ padding: 12 }}>{deal.item}</td>
                  <td style={{ padding: 12 }}>₦{deal.price_ngn.toLocaleString()}</td>
                  <td style={{ padding: 12 }}>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: "bold",
                      background: STATUS_COLORS[deal.status]?.bg || "#333",
                      color: STATUS_COLORS[deal.status]?.color || "#fff",
                    }}>
                      {deal.status}
                    </span>
                  </td>
                  <td style={{ padding: 12, color: "#888", fontSize: 14 }}>{deal.created_at}</td>
                  <td style={{ padding: 12 }}>
                    {deal.explorer_link ? (
                      <a 
                        href={deal.explorer_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#3b82f6", fontSize: 12 }}
                      >
                        View →
                      </a>
                    ) : (
                      <span style={{ color: "#666", fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info */}
      <div style={{ 
        marginTop: 32, 
        padding: 16, 
        background: "#1a1a1a", 
        borderRadius: 8,
        border: "1px solid #333",
        fontSize: 12,
        color: "#888"
      }}>
        <p style={{ margin: "0 0 8px 0" }}>
          <strong>Contract:</strong> {contractId} | <strong>Network:</strong> testnet
        </p>
        <p style={{ margin: 0 }}>
          <strong>Note:</strong> Dispute resolution is manual for v1. Contact support for disputed deals.
        </p>
      </div>
    </main>
  );
}

function StatCard({ label, value, color = "#fff" }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ 
      background: "#1a1a1a", 
      padding: 16, 
      borderRadius: 8,
      border: "1px solid #333"
    }}>
      <div style={{ fontSize: 32, fontWeight: "bold", color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{label}</div>
    </div>
  );
}
