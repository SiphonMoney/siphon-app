"use client";

type SparklineProps = {
  up?: boolean;
  className?: string;
  /** Stretch sparkline to the full width of its container. */
  fullWidth?: boolean;
};

/** Lightweight SVG sparkline — webfour.cloud-style neutrals */
export function Sparkline({ up = true, className = "", fullWidth = false }: SparklineProps) {
  const stroke = up ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)";
  const points = up
    ? "0,28 12,24 24,26 36,18 48,20 60,8 72,12 84,4 96,0"
    : "0,4 12,8 24,6 36,14 48,12 60,22 72,18 84,26 96,28";

  return (
    <svg
      viewBox="0 0 96 28"
      className={`widget-sparkline ${fullWidth ? "widget-sparkline--full" : "widget-sparkline--compact"} ${className}`.trim()}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
