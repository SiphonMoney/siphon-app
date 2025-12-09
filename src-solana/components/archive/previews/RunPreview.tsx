'use client';

import './Previews.css';

export default function RunPreview() {
  return (
    <div className="preview-overlay">
      <div className="preview-content">
        <div className="preview-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
        <h3 className="preview-title">On-Demand Strategy Execution</h3>
        <p className="preview-description">
          Execute your DeFi strategies with fully homomorphic encryption. Run strategies on-demand 
          with complete privacy, monitor performance in real-time, and manage multiple executions simultaneously.
        </p>
        <div className="preview-features">
          <div className="preview-feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Fully homomorphic encrypted execution</span>
          </div>
          <div className="preview-feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Real-time performance monitoring</span>
          </div>
          <div className="preview-feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Loop and schedule strategies</span>
          </div>
          <div className="preview-feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Complete privacy by default</span>
          </div>
        </div>
      </div>
    </div>
  );
}

