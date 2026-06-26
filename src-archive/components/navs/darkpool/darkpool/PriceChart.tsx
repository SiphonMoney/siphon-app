// PriceChart.tsx - Simple price chart component
"use client";

import { useEffect, useRef } from 'react';

interface PriceChartProps {
  pair: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
}

export default function PriceChart({ pair, timeframe }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawChart = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Generate mock price data
    const dataPoints = 50;
    const prices: number[] = [];
    let basePrice = 192.0;
    
    for (let i = 0; i < dataPoints; i++) {
      basePrice += (Math.random() - 0.5) * 2;
      prices.push(Math.max(188, Math.min(196, basePrice)));
    }

    // Find min and max for scaling
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    const padding = 40;

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (height - padding * 2) * (i / 5);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw price line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    prices.forEach((price, index) => {
      const x = padding + (width - padding * 2) * (index / (dataPoints - 1));
      const y = height - padding - ((price - minPrice) / priceRange) * (height - padding * 2);
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw area under curve
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    
    prices.forEach((price, index) => {
      const x = padding + (width - padding * 2) * (index / (dataPoints - 1));
      const y = height - padding - ((price - minPrice) / priceRange) * (height - padding * 2);
      ctx.lineTo(x, y);
    });
    
    ctx.lineTo(width - padding, height - padding);
    ctx.closePath();
    ctx.fill();

    // Draw current price indicator
    const lastPrice = prices[prices.length - 1];
    const lastX = width - padding;
    const lastY = height - padding - ((lastPrice - minPrice) / priceRange) * (height - padding * 2);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw price labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '11px var(--font-source-code), monospace';
    ctx.textAlign = 'right';
    ctx.fillText(maxPrice.toFixed(2), padding - 8, padding + 4);
    ctx.fillText(minPrice.toFixed(2), padding - 8, height - padding + 4);
    ctx.fillText(lastPrice.toFixed(2), width - padding + 8, lastY - 8);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let lastWidth = 0;
    let lastHeight = 0;

    const draw = () => {
      const container = canvas.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const width = Math.max(rect.width || 100, 100);
      const height = Math.max(rect.height || 100, 100);

      // Only redraw if size actually changed
      if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width;
        lastHeight = height;

        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        drawChart(ctx, width, height);
      }
    };

    // Use ResizeObserver with debouncing
    const resizeObserver = new ResizeObserver(() => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(draw);
    });

    const container = canvas.parentElement;
    if (container) {
      resizeObserver.observe(container);
      // Initial draw after a short delay to ensure container is sized
      setTimeout(draw, 100);
    }

    return () => {
      resizeObserver.disconnect();
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [pair, timeframe]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      />
    </div>
  );
}
