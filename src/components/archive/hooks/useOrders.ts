// useOrders.ts - Hook for order management
"use client";

import { useState, useCallback, useEffect } from 'react';
import { BACKEND_URL } from '@/components/archive/lib/constants';

export interface Order {
  orderId: string;
  orderType: 'Buy' | 'Sell';
  amount: number;
  price: number;
  status: string;
  lockedAmount: number;
  timestamp: number;
}

export interface OrdersState {
  orders: Order[];
  loading: boolean;
  error: string | null;
}

export function useOrders(walletAddress: string | null, autoRefresh = true) {
  const [state, setState] = useState<OrdersState>({
    orders: [],
    loading: false,
    error: null,
  });

  const fetchOrders = useCallback(async () => {
    if (!walletAddress) {
      setState({ orders: [], loading: false, error: null });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch orderIDs from backend
      const response = await fetch(`${BACKEND_URL}/api/orders/${walletAddress}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const data = await response.json();
      
      // TODO: Fetch and decrypt actual order data from chain
      // For now, return mock data
      const orders: Order[] = data.orderIds?.map((id: number) => ({
        orderId: id.toString(),
        orderType: 'Buy' as const,
        amount: 1.0,
        price: 192.0,
        status: 'Pending',
        lockedAmount: 0,
        timestamp: Date.now(),
      })) || [];

      setState({ orders, loading: false, error: null });
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!autoRefresh) return;

    fetchOrders();
    
    // Poll every 10 seconds for updates
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders, autoRefresh]);

  return {
    ...state,
    fetchOrders,
  };
}

