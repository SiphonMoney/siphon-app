// useOrders.ts - Hook for fetching user orders
"use client";

import { useState, useEffect, useCallback } from 'react';

export interface Order {
  id: string;
  type: 'buy' | 'sell';
  price: string;
  amount: string;
  status: 'pending' | 'matched' | 'cancelled';
  timestamp: number;
}

interface UseOrdersResult {
  orders: Order[];
  loading: boolean;
  error: string | null;
  refreshOrders: () => Promise<void>;
  fetchOrders: () => Promise<void>;
}

export function useOrders(walletAddress: string): UseOrdersResult {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Fetch orders from backend
      // For now, return empty array
      setOrders([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (walletAddress) {
      refreshOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]); // Only refresh when walletAddress changes

  return {
    orders,
    loading,
    error,
    refreshOrders,
    fetchOrders: refreshOrders // Alias for compatibility
  };
}
