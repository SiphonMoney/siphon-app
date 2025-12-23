"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Node, Edge } from '@xyflow/react';
import "./BuildNav.css";

interface BuildNavProps {
  nodes: Node[];
  currentFileName: string;
  savedScenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>;
  onAddNode: (type: 'deposit' | 'withdraw' | 'swap' | 'strategy', chainOrDexOrStrategy?: string) => void;
  onSaveScene: (sceneName: string) => void;
  onLoadScene: (sceneName: string) => void;
  onDeleteScene: (sceneName: string) => void;
  onRestart: () => void;
  onExecuteStrategy: () => void;
  setCurrentFileName: (name: string) => void;
}

export default function BuildNav({
  nodes,
  currentFileName,
  savedScenes,
  onAddNode,
  onSaveScene,
  onLoadScene,
  onDeleteScene,
  onRestart,
  onExecuteStrategy,
  setCurrentFileName
}: BuildNavProps) {
  const [showSubmenu, setShowSubmenu] = useState<{ type: 'deposit' | 'withdraw' | 'swap' | 'strategy'; x: number; y: number } | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sceneName, setSceneName] = useState('');
  const [showSavedScenesDropdown, setShowSavedScenesDropdown] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [selectedAddType, setSelectedAddType] = useState<'deposit' | 'withdraw' | 'swap' | 'strategy' | null>(null);
  
  const submenuRef = useRef<HTMLDivElement>(null);
  
  const chains = ['Sepolia', 'Solana', 'Zcash', 'Bitcoin', 'XMR', 'Ethereum'];
  const dexes = ['Uniswap', 'Raydium', 'Jupiter', 'Orca', 'Serum', 'Meteora'];
  const strategies = ['Limit Order', 'Buy Dip', 'Sell Rally', 'DCA'];
  
  // Active options
  const activeChain = 'Sepolia';
  const activeDex = 'Uniswap';
  const activeStrategy = 'Limit Order';
  
  const isChainActive = (chain: string) => chain === activeChain;
  const isDexActive = (dex: string) => dex === activeDex;
  const isStrategyActive = (strategy: string) => strategy === activeStrategy;
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (submenuRef.current && event.target instanceof Element && !submenuRef.current.contains(event.target)) {
        setShowSubmenu(null);
      }
    };
    
    if (showSubmenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSubmenu]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target && !target.closest('.blueprint-saved-scenes')) {
        setShowSavedScenesDropdown(false);
      }
    };
    
    if (showSavedScenesDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSavedScenesDropdown]);
  
  const onActionClick = useCallback((type: 'deposit' | 'withdraw' | 'swap' | 'strategy', event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const actionsButtons = event.currentTarget.closest('.blueprint-actions-buttons');
    if (actionsButtons) {
      const buttonsRect = actionsButtons.getBoundingClientRect();
      setShowSubmenu({
        type,
        x: rect.left - buttonsRect.left,
        y: 0
      });
    }
  }, []);
  
  const handleSaveScene = useCallback(() => {
    if (!sceneName.trim()) {
      alert('Please enter a scene name');
      return;
    }
    
    onSaveScene(sceneName.trim());
    setCurrentFileName(`${sceneName.trim()}.io`);
    setShowSaveDialog(false);
    setSceneName('');
    
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 1500);
  }, [sceneName, onSaveScene, setCurrentFileName]);
  
  const handleLoadScene = useCallback((sceneName: string) => {
    onLoadScene(sceneName);
    setShowSavedScenesDropdown(false);
    setShowOpenModal(false);
  }, [onLoadScene]);

  return (
    <>
      <div className="blueprint-top-bar">
        <div className="blueprint-actions-left">
          <div className="blueprint-saved-scenes desktop-only" style={{ position: 'relative' }}>
            <button 
              className="blueprint-icon-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowSavedScenesDropdown(!showSavedScenesDropdown);
              }}
              title="Saved Scenes"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            {showSavedScenesDropdown && (
              <div className="blueprint-scenes-dropdown">
                {savedScenes.length === 0 ? (
                  <div className="blueprint-scenes-empty">No saved scenes</div>
                ) : (
                  savedScenes.map((scene) => (
                    <div key={scene.name} className="blueprint-scene-item">
                      <button
                        className="blueprint-scene-load"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadScene(scene.name);
                        }}
                      >
                        {scene.name}
                      </button>
                      <button
                        className="blueprint-scene-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteScene(scene.name);
                        }}
                        title="Delete scene"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          {/* Mobile: Open button */}
          <button 
            className="blueprint-icon-btn mobile-only"
            onClick={(e) => {
              e.stopPropagation();
              setShowOpenModal(true);
            }}
            title="Open Scene"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button 
            className={`blueprint-icon-btn ${saveSuccess ? 'save-success' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (nodes.length > 0 && !saveSuccess) {
                setShowSaveDialog(true);
              }
            }}
            disabled={nodes.length === 0 || saveSuccess}
            title="Save Scene"
          >
            {saveSuccess ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="checkmark-icon">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            )}
          </button>
          <span className="blueprint-file-name">{currentFileName}</span>
          <span className="blueprint-actions-label desktop-only" style={{ marginLeft: '1rem' }}>Add:</span>
          <div className="blueprint-actions-buttons desktop-only" style={{ position: 'relative' }}>
            <button 
              className="blueprint-action-btn"
              onClick={(e) => onActionClick('deposit', e)}
            >
              Deposit
            </button>
            <button 
              className="blueprint-action-btn"
              onClick={(e) => onActionClick('strategy', e)}
            >
              Strategies
            </button>
            <button 
              className="blueprint-action-btn"
              onClick={(e) => onActionClick('swap', e)}
            >
              Swap
            </button>
            <button 
              className="blueprint-action-btn"
              onClick={(e) => onActionClick('withdraw', e)}
            >
              Withdraw
            </button>
            {showSubmenu && (
              <div 
                ref={submenuRef}
                className="blueprint-submenu-wrapper"
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  className="blueprint-submenu"
                  style={{
                    left: `${showSubmenu.x}px`
                  }}
                >
                  <div className="blueprint-submenu-header">
                    {showSubmenu.type === 'deposit' 
                      ? 'Deposit from:' 
                      : showSubmenu.type === 'withdraw'
                      ? 'Withdraw to:'
                      : showSubmenu.type === 'swap'
                      ? 'Swap on:'
                      : 'Strategy:'}
                  </div>
                  {showSubmenu.type === 'strategy' ? (
                    strategies.map((strategy) => {
                      const isActive = isStrategyActive(strategy);
                      return (
                        <button
                          key={strategy}
                          className={`blueprint-submenu-item ${!isActive ? 'inactive' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isActive) {
                              onAddNode(showSubmenu.type, strategy);
                              setShowSubmenu(null);
                            }
                          }}
                          disabled={!isActive}
                        >
                          {strategy}
                        </button>
                      );
                    })
                  ) : (showSubmenu.type === 'swap' ? dexes : chains).map((item) => {
                    const isActive = showSubmenu.type === 'swap' ? isDexActive(item) : isChainActive(item);
                    return (
                      <button
                        key={item}
                        className={`blueprint-submenu-item ${!isActive ? 'inactive' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isActive) {
                            onAddNode(showSubmenu.type, item);
                            setShowSubmenu(null);
                          }
                        }}
                        disabled={!isActive}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* Mobile: Plus button - opens fullscreen modal (last on mobile) */}
          <button 
            className="blueprint-icon-btn mobile-only"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddModal(true);
            }}
            title="Add Node"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <div className="blueprint-actions-right">
          <button 
            className="blueprint-restart-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (nodes.length > 0) {
                onRestart();
              }
            }}
            disabled={nodes.length === 0}
            title="Clear canvas"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </button>
          <button 
            className="blueprint-execute-btn desktop-only"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (nodes.length > 0) {
                onExecuteStrategy();
              }
            }}
            disabled={nodes.length === 0}
          >
            Test Strategy
          </button>
        </div>
      </div>

      {showSaveDialog && (
        <div className="blueprint-save-dialog-overlay" onClick={(e) => {
          e.stopPropagation();
          setShowSaveDialog(false);
          setSceneName('');
        }}>
          <div className="blueprint-save-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="blueprint-save-dialog-header">
              <h3>Save Scene</h3>
              <button 
                className="blueprint-save-dialog-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSaveDialog(false);
                  setSceneName('');
                }}
              >
                ×
              </button>
            </div>
            <div className="blueprint-save-dialog-content">
              <input
                type="text"
                className="blueprint-save-dialog-input"
                placeholder="Enter scene name"
                value={sceneName}
                onChange={(e) => setSceneName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    handleSaveScene();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
            <div className="blueprint-save-dialog-actions">
              <button 
                className="blueprint-save-dialog-cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSaveDialog(false);
                  setSceneName('');
                }}
              >
                Cancel
              </button>
              <button 
                className="blueprint-save-dialog-save"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveScene();
                }}
                disabled={!sceneName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Add Node Fullscreen Modal */}
      {showAddModal && (
        <div className="blueprint-mobile-modal-overlay" onClick={(e) => {
          e.stopPropagation();
          setShowAddModal(false);
          setSelectedAddType(null);
        }}>
          <div className="blueprint-mobile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="blueprint-mobile-modal-header">
              <h3>{selectedAddType ? (
                selectedAddType === 'deposit' ? 'Deposit from:' :
                selectedAddType === 'withdraw' ? 'Withdraw to:' :
                selectedAddType === 'swap' ? 'Swap on:' :
                'Strategy:'
              ) : 'Add Node'}</h3>
              <button 
                className="blueprint-mobile-modal-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddModal(false);
                  setSelectedAddType(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="blueprint-mobile-modal-content">
              {!selectedAddType ? (
                <>
                  <button 
                    className="blueprint-mobile-modal-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAddType('deposit');
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Deposit</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  <button 
                    className="blueprint-mobile-modal-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAddType('strategy');
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                    <span>Strategies</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  <button 
                    className="blueprint-mobile-modal-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAddType('swap');
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />
                    </svg>
                    <span>Swap</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  <button 
                    className="blueprint-mobile-modal-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAddType('withdraw');
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Withdraw</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button 
                    className="blueprint-mobile-modal-back-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAddType(null);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    <span>Back</span>
                  </button>
                  {selectedAddType === 'strategy' ? (
                    strategies.map((strategy) => {
                      const isActive = isStrategyActive(strategy);
                      return (
                        <button
                          key={strategy}
                          className={`blueprint-mobile-modal-btn ${!isActive ? 'inactive' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isActive) {
                              onAddNode(selectedAddType, strategy);
                              setShowAddModal(false);
                              setSelectedAddType(null);
                            }
                          }}
                          disabled={!isActive}
                        >
                          <span>{strategy}</span>
                        </button>
                      );
                    })
                  ) : selectedAddType === 'swap' ? (
                    dexes.map((dex) => {
                      const isActive = isDexActive(dex);
                      return (
                        <button
                          key={dex}
                          className={`blueprint-mobile-modal-btn ${!isActive ? 'inactive' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isActive) {
                              onAddNode(selectedAddType, dex);
                              setShowAddModal(false);
                              setSelectedAddType(null);
                            }
                          }}
                          disabled={!isActive}
                        >
                          <span>{dex}</span>
                        </button>
                      );
                    })
                  ) : (
                    chains.map((chain) => {
                      const isActive = isChainActive(chain);
                      return (
                        <button
                          key={chain}
                          className={`blueprint-mobile-modal-btn ${!isActive ? 'inactive' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isActive) {
                              onAddNode(selectedAddType, chain);
                              setShowAddModal(false);
                              setSelectedAddType(null);
                            }
                          }}
                          disabled={!isActive}
                        >
                          <span>{chain}</span>
                        </button>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Open Scene Fullscreen Modal */}
      {showOpenModal && (
        <div className="blueprint-mobile-modal-overlay" onClick={(e) => {
          e.stopPropagation();
          setShowOpenModal(false);
        }}>
          <div className="blueprint-mobile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="blueprint-mobile-modal-header">
              <h3>Open Scene</h3>
              <button 
                className="blueprint-mobile-modal-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowOpenModal(false);
                }}
              >
                ×
              </button>
            </div>
            <div className="blueprint-mobile-modal-content blueprint-mobile-modal-scenes">
              {savedScenes.length === 0 ? (
                <div className="blueprint-mobile-modal-empty">No saved scenes</div>
              ) : (
                savedScenes.map((scene) => (
                  <button
                    key={scene.name}
                    className="blueprint-mobile-modal-scene-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoadScene(scene.name);
                    }}
                  >
                    <span>{scene.name}</span>
                    <button
                      className="blueprint-mobile-modal-scene-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteScene(scene.name);
                      }}
                      title="Delete scene"
                    >
                      ×
                    </button>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
