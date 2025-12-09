// OrderList.tsx - Display user's orders
"use client";

import { useOrders } from '@/components/archive/hooks/useOrders';
import './darkpool.css';

interface OrderListProps {
  walletAddress: string;
}

export default function OrderList({ walletAddress }: OrderListProps) {
  const { orders, loading, error, fetchOrders } = useOrders(walletAddress);

  if (loading && orders.length === 0) {
    return (
      <div className="order-list">
        <div className="loading-state">
          <div className="spinner"></div>
          <span>Loading orders...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-list">
        <div className="error-state">
          <span className="icon">⚠️</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="order-list">
      <div className="order-list-header">
        <h3>Your Orders</h3>
        <button 
          onClick={fetchOrders}
          disabled={loading}
          className="refresh-btn"
          title="Refresh orders"
        >
          {loading ? '⟳' : '🔄'}
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <span className="icon">📋</span>
          <p>No orders yet</p>
          <span className="hint">Place your first order to get started</span>
        </div>
      ) : (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Price</th>
                <th>Status</th>
                <th>Locked</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.orderId}>
                  <td className="order-id">#{order.orderId}</td>
                  <td>
                    <span className={`order-type-badge ${order.orderType.toLowerCase()}`}>
                      {order.orderType}
                    </span>
                  </td>
                  <td>{order.amount.toFixed(4)} SOL</td>
                  <td>${order.price.toFixed(2)}</td>
                  <td>
                    <span className={`status-badge status-${order.status.toLowerCase().replace(' ', '-')}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>{order.lockedAmount.toFixed(4)}</td>
                  <td className="timestamp">
                    {new Date(order.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

