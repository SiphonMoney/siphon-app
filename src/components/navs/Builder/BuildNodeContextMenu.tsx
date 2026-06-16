"use client";

import { useEffect, useRef } from "react";
import "./BuildNodeContextMenu.css";

export interface BuildNodeContextMenuProps {
  x: number;
  y: number;
  nodeLabel?: string;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}

export default function BuildNodeContextMenu({
  x,
  y,
  nodeLabel,
  onDelete,
  onDuplicate,
  onClose,
}: BuildNodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="build-node-context-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label={nodeLabel ? `Actions for ${nodeLabel}` : "Block actions"}
    >
      {nodeLabel && (
        <div className="build-node-context-menu-label">{nodeLabel}</div>
      )}
      <button
        type="button"
        className="build-node-context-menu-item"
        role="menuitem"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        Duplicate block
      </button>
      <button
        type="button"
        className="build-node-context-menu-item build-node-context-menu-item-danger"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        Delete block
      </button>
    </div>
  );
}
