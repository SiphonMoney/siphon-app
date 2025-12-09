"use client";

import { useEffect, useRef, useState } from "react";

export default function SoftHorizonCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fadeOpacity, setFadeOpacity] = useState(0);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "-1";
    
    const mountTarget = containerRef.current ?? document.body;
    mountTarget.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return () => {};

    const getWidth = () => window.innerWidth * window.devicePixelRatio;
    const getHeight = () => window.innerHeight * window.devicePixelRatio;

    let width = getWidth();
    let height = getHeight();
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    // Draw ASCII characters background
    const drawAsciiBackground = (time: number = 0) => {
      ctx.clearRect(0, 0, width, height);
      
      const asciiFontSize = Math.round(14 * window.devicePixelRatio);
      const asciiSpacing = Math.round(16 * window.devicePixelRatio);
      const characterSet = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^'. ";
      
      ctx.font = `${asciiFontSize}px Courier New`;
      
      const charsPerRow = Math.ceil(width / asciiSpacing);
      const rows = Math.ceil(height / asciiSpacing);
      
      for (let row = 0; row < rows; row++) {
        // Generate random seed for this row that changes over time
        const rowSeed = Math.floor((row * 7919 + time * 100) % 2147483647);
        let randomState = rowSeed;
        
        for (let col = 0; col < charsPerRow; col++) {
          // Simple PRNG for each character position
          randomState = (randomState * 1103515245 + 12345) & 0x7fffffff;
          const charIndex = randomState % characterSet.length;
          const char = characterSet[charIndex];
          
          // Varying opacity that changes with time and position
          const baseOpacity = 0.25;
          const opacityVariation = Math.sin((row * col + time * 0.5) * 0.05) * 0.08;
          const opacity = Math.max(0.15, Math.min(0.35, baseOpacity + opacityVariation));
          
          // Light grey to white color
          const greyValue = 220;
          ctx.fillStyle = `rgba(${greyValue}, ${greyValue}, ${greyValue}, ${opacity})`;
          ctx.fillText(char, col * asciiSpacing, row * asciiSpacing + asciiFontSize);
        }
      }
    };

    // Initial draw
    drawAsciiBackground(0);

    const onResize = () => {
      width = getWidth();
      height = getHeight();
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      drawAsciiBackground(0);
    };

    let rafId = 0;
    let lastUpdate = 0;
    const animate = (currentTime: number) => {
      // Update ASCII background every ~0.5 seconds for animated transparency (slower)
      if (currentTime - lastUpdate > 100) {
        drawAsciiBackground(currentTime / 1000);
        lastUpdate = currentTime;
      }
      rafId = requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
    window.addEventListener("resize", onResize);

    // Fade-in animation
    const targetOpacity = 0.35;
    const fadeDuration = 2000; // 2 seconds
    const startTime = Date.now();
    
    const fadeIn = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / fadeDuration, 1);
      // Ease-out curve for smooth fade
      const eased = 1 - Math.pow(1 - progress, 3);
      setFadeOpacity(eased * targetOpacity);
      
      if (progress < 1) {
        requestAnimationFrame(fadeIn);
      } else {
        setFadeOpacity(targetOpacity);
      }
    };
    
    requestAnimationFrame(fadeIn);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      if (mountTarget.contains(canvas)) {
        mountTarget.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      style={{
        opacity: fadeOpacity,
        transition: 'opacity 0.1s ease-out'
      }}
    />
  );
}


