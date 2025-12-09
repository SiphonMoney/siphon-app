"use client";

import { useState, useEffect } from "react";
import { useNodesState, useEdgesState, Node, Edge } from '@xyflow/react';
import "./ProSwapMode.css";
import BuildPreview from "./archive/previews/BuildPreview";
import RunPreview from "./archive/previews/RunPreview";
import DiscoverPreview from "./archive/previews/DiscoverPreview";
import Discover from "./navs/Discover/Discover";
import Build from "./navs/Builder/Build";
import Run from "./navs/Run/Run";

interface ProSwapModeProps {
  isLoaded?: boolean;
  isDemoMode?: boolean;
}

export default function ProSwapMode({
  isLoaded = true,
  isDemoMode = false
}: ProSwapModeProps) {
  const [viewMode, setViewMode] = useState<'blueprint' | 'run' | 'discover'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pro-view-mode');
      if (stored && ['blueprint', 'run', 'discover'].includes(stored)) {
        return stored as 'blueprint' | 'run' | 'discover';
      }
    }
    return 'blueprint';
  });
  const [runningStrategies, setRunningStrategies] = useState<Map<string, { startTime: number; isRunning: boolean; loop: boolean }>>(new Map());
  const [savedScenes, setSavedScenes] = useState<Array<{ name: string; nodes: Node[]; edges: Edge[] }>>([]);
  const [currentFileName, setCurrentFileName] = useState<string>('untitled.io');
  const [favoriteStrategies, setFavoriteStrategies] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  
  // React Flow state
  const initialNodes: Node[] = [];
  
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  

  // Listen for view mode changes from Nav component
  useEffect(() => {
    const handleViewModeChange = (event: CustomEvent) => {
      const mode = event.detail as 'blueprint' | 'run' | 'discover';
      setViewMode(mode);
      localStorage.setItem('pro-view-mode', mode);
    };

    window.addEventListener('pro-view-mode-change', handleViewModeChange as EventListener);
    return () => {
      window.removeEventListener('pro-view-mode-change', handleViewModeChange as EventListener);
    };
  }, []);


  // Load saved scenes from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('siphon-blueprint-scenes');
    if (stored) {
      try {
        const scenes = JSON.parse(stored);
        setSavedScenes(scenes);
      } catch (error) {
        console.error('Failed to load saved scenes:', error);
      }
    } else {
      // Initialize with mock discover strategies
      const mockStrategies = [
        {
          name: 'Buy High - Sell Low',
          nodes: [
            { id: '1', type: 'strategy', position: { x: 100, y: 100 }, data: { type: 'strategy', label: 'Buy High', command: 'buy --price high' } },
            { id: '2', type: 'strategy', position: { x: 300, y: 100 }, data: { type: 'strategy', label: 'Sell Low', command: 'sell --price low' } }
          ],
          edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' }
          ]
        },
        {
          name: 'DCA to Oblivion',
          nodes: [
            { id: '1', type: 'strategy', position: { x: 100, y: 100 }, data: { type: 'strategy', label: 'DCA Start', command: 'dca --interval 1h' } },
            { id: '2', type: 'strategy', position: { x: 300, y: 100 }, data: { type: 'strategy', label: 'Check Price', command: 'price --token BTC' } },
            { id: '3', type: 'strategy', position: { x: 500, y: 100 }, data: { type: 'strategy', label: 'Buy', command: 'buy --amount 100' } },
            { id: '4', type: 'strategy', position: { x: 300, y: 200 }, data: { type: 'strategy', label: 'Loop', command: 'loop --forever' } }
          ],
          edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
            { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
            { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
            { id: 'e4-2', source: '4', target: '2', type: 'smoothstep' }
          ]
        }
      ];
      setSavedScenes(mockStrategies);
      localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(mockStrategies));
    }
    
    // Load favorites
    const favorites = localStorage.getItem('siphon-favorite-strategies');
    if (favorites) {
      try {
        setFavoriteStrategies(new Set(JSON.parse(favorites)));
      } catch (error) {
        console.error('Failed to load favorites:', error);
      }
    }
  }, []);
  
  

  return (
    <div className="pro-mode-wrapper">
      {/* Mode Selector - Hidden, controlled from Nav */}

      {/* Content or Preview */}
      {!isDemoMode ? (
        <>
          {/* Blurred Content */}
          <div className="pro-mode-blur-overlay">
            {viewMode === 'discover' ? (
              <div className={`discover-view ${isLoaded ? 'loaded' : ''}`}>
                {/* Discover content - blurred */}
              </div>
            ) : viewMode === 'run' ? (
              <div className={`run-mode-view ${isLoaded ? 'loaded' : ''}`}>
                {/* Run content - blurred */}
              </div>
            ) : (
              <div className={`blueprint-view ${isLoaded ? 'loaded' : ''}`}>
                {/* Blueprint content - blurred */}
              </div>
            )}
          </div>
          {/* Preview Overlay */}
          {viewMode === 'blueprint' && <BuildPreview />}
          {viewMode === 'run' && <RunPreview />}
          {viewMode === 'discover' && <DiscoverPreview />}
        </>
      ) : (
        <div className="pro-mode-content">
        {viewMode === 'discover' ? (
          <Discover
            isLoaded={isLoaded}
            setNodes={setNodes}
            setEdges={setEdges}
            setViewMode={setViewMode}
            setCurrentFileName={setCurrentFileName}
            savedScenes={savedScenes}
            setSavedScenes={setSavedScenes}
          />
        ) : viewMode === 'run' ? (
          <Run
            isLoaded={isLoaded}
            savedScenes={savedScenes}
            setSavedScenes={setSavedScenes}
            favoriteStrategies={favoriteStrategies}
            showFavoritesOnly={showFavoritesOnly}
            setShowFavoritesOnly={setShowFavoritesOnly}
            runningStrategies={runningStrategies}
            setRunningStrategies={setRunningStrategies}
            setNodes={setNodes}
            setEdges={setEdges}
            setCurrentFileName={setCurrentFileName}
            setViewMode={setViewMode}
          />
        ) : (
          <Build
            isLoaded={isLoaded}
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
            currentFileName={currentFileName}
            setCurrentFileName={setCurrentFileName}
            savedScenes={savedScenes}
            setSavedScenes={setSavedScenes}
          />
        )}
        </div>
      )}
    </div>
  );
}
