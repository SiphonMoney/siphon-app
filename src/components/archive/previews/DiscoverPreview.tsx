'use client';

import './Previews.css';

export default function DiscoverPreview() {
  return (
    <div className="preview-overlay">
      <div className="preview-content">
        <div className="preview-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <h3 className="preview-title">Community Strategy Library</h3>
        <p className="preview-description">
          Explore a curated library of DeFi strategies created by the community. Discover proven 
          trading workflows, filter by performance metrics, and add successful strategies to your collection.
        </p>
        <div className="preview-features">
          <div className="preview-feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Curated community strategies</span>
          </div>
          <div className="preview-feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Filter by performance and category</span>
          </div>
          <div className="preview-feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Save favorites to your library</span>
          </div>
          <div className="preview-feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Edit and customize for your needs</span>
          </div>
        </div>
      </div>
    </div>
  );
}

