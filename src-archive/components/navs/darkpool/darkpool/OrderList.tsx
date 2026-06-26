// OrderList.tsx - Display user's orders
"use client";

import { useOrders } from './useOrders';
import './darkpool.css';

interface OrderListProps {
  walletAddress: string | null;
}

export default function OrderList({ walletAddress }: OrderListProps) {
  // Always call hooks at the top level, before any conditional returns
  const { orders, loading, error, fetchOrders } = useOrders(walletAddress || '');

  // Don't render if no wallet address
  if (!walletAddress) {
    return (
      <div className="order-list">
        <div className="empty-state">
          <p>Connect wallet to view orders</p>
        </div>
      </div>
    );
  }

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
          {loading ? '⟳' : '⟳'}
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
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
                <tr key={order.id}>
                  <td className="order-id">#{order.id}</td>
                  <td>
                    <span className={`order-type-badge ${order.type.toLowerCase()}`}>
                      {order.type}
                    </span>
                  </td>
                  <td>{parseFloat(order.amount).toFixed(4)} SOL</td>
                  <td>${parseFloat(order.price).toFixed(2)}</td>
                  <td>
                    <span className={`status-badge status-${order.status.toLowerCase().replace(' ', '-')}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>-</td>
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

