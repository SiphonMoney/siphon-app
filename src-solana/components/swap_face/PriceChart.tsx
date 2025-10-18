"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface PriceData {
  time: string;
  price: number;
  volume: number;
}

interface PriceChartProps {
  pair: string;
  timeframe?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
}

export default function PriceChart({ pair, timeframe = '1h' }: PriceChartProps) {
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);

  // Generate mock price data that simulates real market behavior
  const generateMockData = () => {
    const data: PriceData[] = [];
    const now = new Date();
    const basePrice = pair.includes('SOL') ? 150 : pair.includes('ETH') ? 3000 : 45000;
    
    // Generate data points for the last 24 hours
    for (let i = 24; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hour = time.getHours();
      
      // Simulate realistic price movements
      const volatility = 0.02; // 2% volatility
      const trend = Math.sin(hour / 24 * Math.PI * 2) * 0.01; // Daily cycle
      const randomWalk = (Math.random() - 0.5) * volatility;
      
      const priceChange = trend + randomWalk;
      const price = basePrice * (1 + priceChange);
      const volume = Math.random() * 1000000 + 500000; // Random volume
      
      data.push({
        time: time.toISOString().slice(11, 16), // HH:MM format
        price: Math.round(price * 100) / 100,
        volume: Math.round(volume),
      });
    }
    
    return data;
  };

  useEffect(() => {
    setIsLoading(true);
    
    // Simulate API call delay
    setTimeout(() => {
      const data = generateMockData();
      setPriceData(data);
      
      if (data.length > 0) {
        const latest = data[data.length - 1];
        const previous = data[data.length - 2];
        setCurrentPrice(latest.price);
        setPriceChange(((latest.price - previous.price) / previous.price) * 100);
      }
      
      setIsLoading(false);
    }, 500);
  }, [pair, timeframe]);

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toString();
  };

  if (isLoading) {
    return (
      <div className="price-chart loading">
        <div className="chart-header">
          <h4>{pair} Price Chart</h4>
          <div className="loading-spinner"></div>
        </div>
        <div className="chart-placeholder">
          <div className="loading-text">Loading chart data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="price-chart">
      <div className="chart-header">
        <h4>{pair} Price Chart</h4>
        <div className="price-info">
          <span className="current-price">{formatPrice(currentPrice)}</span>
          <span className={`price-change ${priceChange >= 0 ? 'positive' : 'negative'}`}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
          </span>
        </div>
      </div>
      
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={priceData}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#667eea" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#667eea" stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis 
              dataKey="time" 
              stroke="rgba(255,255,255,0.6)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="rgba(255,255,255,0.6)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              domain={['dataMin - 5', 'dataMax + 5']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: 'white',
              }}
              formatter={(value: number, name: string) => [
                name === 'price' ? formatPrice(value) : formatVolume(value),
                name === 'price' ? 'Price' : 'Volume'
              ]}
              labelStyle={{ color: 'white' }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#667eea"
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="chart-footer">
        <div className="timeframe-selector">
          <button className={`timeframe-btn ${timeframe === '1m' ? 'active' : ''}`}>1m</button>
          <button className={`timeframe-btn ${timeframe === '5m' ? 'active' : ''}`}>5m</button>
          <button className={`timeframe-btn ${timeframe === '15m' ? 'active' : ''}`}>15m</button>
          <button className={`timeframe-btn ${timeframe === '1h' ? 'active' : ''}`}>1h</button>
          <button className={`timeframe-btn ${timeframe === '4h' ? 'active' : ''}`}>4h</button>
          <button className={`timeframe-btn ${timeframe === '1d' ? 'active' : ''}`}>1d</button>
        </div>
        
        <div className="chart-stats">
          <div className="stat">
            <span className="stat-label">24h High</span>
            <span className="stat-value">{formatPrice(Math.max(...priceData.map(d => d.price)))}</span>
          </div>
          <div className="stat">
            <span className="stat-label">24h Low</span>
            <span className="stat-value">{formatPrice(Math.min(...priceData.map(d => d.price)))}</span>
          </div>
          <div className="stat">
            <span className="stat-label">24h Volume</span>
            <span className="stat-value">{formatVolume(priceData.reduce((sum, d) => sum + d.volume, 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
