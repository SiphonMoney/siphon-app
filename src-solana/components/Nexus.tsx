"use client";

import { useState, useEffect } from "react";
import { useNodesState, useEdgesState, Node, Edge } from '@xyflow/react';
import Discover from "./navs/Discover/Discover";
import Build from "./navs/Builder/Build";
import Run from "./navs/Run/Run";
import UserDash from "./navs/UserDash/UserDash";

interface NexusProps {
  isLoaded?: boolean;
}

export default function Nexus({
  isLoaded = true
}: NexusProps) {
  const [viewMode, setViewMode] = useState<'blueprint' | 'run' | 'discover' | 'userdash'>('discover');
  const [runningStrategies, setRunningStrategies] = useState<Map<string, { startTime: number; isRunning: boolean; loop: boolean }>>(new Map());
  const [savedScenes, setSavedScenes] = useState<Array<{ name: string; nodes: Node[]; edges: Edge[] }>>([]);
  const [currentFileName, setCurrentFileName] = useState<string>('untitled.io');

  // Load saved strategies from localStorage so Run > My Alphas shows them
  useEffect(() => {
    const key = 'siphon-blueprint-scenes';
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Array<{ name: string; nodes: Node[]; edges: Edge[] }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedScenes(parsed);
        }
      } catch (error) {
        console.error('Failed to load saved scenes from localStorage:', error);
      }
    }
  }, []);
  const [favoriteStrategies, setFavoriteStrategies] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  
  // React Flow state
  const initialNodes: Node[] = [];
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  useEffect(() => {
    const handleWalletConnected = () => setWalletConnected(true);
    const handleWalletDisconnected = () => setWalletConnected(false);

    window.addEventListener('walletConnected', handleWalletConnected);
    window.addEventListener('walletDisconnected', handleWalletDisconnected);

    return () => {
      window.removeEventListener('walletConnected', handleWalletConnected);
      window.removeEventListener('walletDisconnected', handleWalletDisconnected);
    };
  }, []);

  // Listen for view mode changes from Nav component or balance click
  useEffect(() => {
    const handleViewModeChange = (event: CustomEvent) => {
      const mode = event.detail as 'blueprint' | 'run' | 'discover' | 'userdash';
      setViewMode(mode);
    };

    window.addEventListener('pro-view-mode-change', handleViewModeChange as EventListener);
    window.addEventListener('userdash-view-change', handleViewModeChange as EventListener);
    return () => {
      window.removeEventListener('pro-view-mode-change', handleViewModeChange as EventListener);
      window.removeEventListener('userdash-view-change', handleViewModeChange as EventListener);
    };
  }, []);

  // Load favorites from localStorage on mount
  useEffect(() => {
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
    <div className="pro-mode-wrapper" style={{ height: '100%', maxHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="pro-mode-content" style={{ paddingTop: '2rem', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {viewMode === 'discover' ? (
          <Discover
            isLoaded={isLoaded}
            setNodes={setNodes}
            setEdges={setEdges}
            setViewMode={setViewMode}
            setCurrentFileName={setCurrentFileName}
            savedScenes={savedScenes}
            setSavedScenes={setSavedScenes}
            runningStrategies={runningStrategies}
            setRunningStrategies={setRunningStrategies}
            favoriteStrategies={favoriteStrategies}
            setFavoriteStrategies={setFavoriteStrategies}
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
        ) : viewMode === 'userdash' ? (
          <UserDash
            isLoaded={isLoaded}
            walletConnected={walletConnected}
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
    </div>
  );
}

