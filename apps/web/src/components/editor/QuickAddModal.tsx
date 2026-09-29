'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Zap, Database, GitBranch, Globe, Bot, Sliders } from 'lucide-react';
import { useEditor } from './EditorContext.js';

function getIcon(category: string) {
  switch (category) {
    case 'TRIGGERS':
      return <Zap className="h-4 w-4 text-amber-500" />;
    case 'DATA':
      return <Database className="h-4 w-4 text-cyan-500" />;
    case 'LOGIC':
      return <GitBranch className="h-4 w-4 text-orange-500" />;
    case 'API':
      return <Globe className="h-4 w-4 text-blue-500" />;
    case 'AI':
      return <Bot className="h-4 w-4 text-purple-500" />;
    case 'NOTIFICATION':
      return <Zap className="h-4 w-4 text-green-500" />;
    default:
      return <Sliders className="h-4 w-4 text-slate-400" />;
  }
}

export function QuickAddModal() {
  const { catalog, isQuickAddOpen, setIsQuickAddOpen, addNode } = useEditor();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const all = Object.values(catalog);
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q)
    );
  }, [catalog, search]);

  useEffect(() => {
    if (isQuickAddOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isQuickAddOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!isQuickAddOpen) return null;

  const handleSelect = (type: string) => {
    addNode(type);
    setIsQuickAddOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = items[selectedIndex];
      if (current) {
        handleSelect(current.type);
      }
    } else if (e.key === 'Escape') {
      setIsQuickAddOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50 backdrop-blur-xs p-4"
      onClick={() => setIsQuickAddOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center border-b border-border px-3 py-2.5">
          <Search className="mr-2 h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a node name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {items.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No matching nodes found.
            </div>
          ) : (
            items.map((node, idx) => (
              <div
                key={node.type}
                onClick={() => handleSelect(node.type)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                  idx === selectedIndex ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  {getIcon(node.category)}
                  <div>
                    <div className="font-medium truncate">{node.name}</div>
                    <div
                      className={`text-[10px] truncate ${
                        idx === selectedIndex
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {node.description}
                    </div>
                  </div>
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-mono capitalize ${
                    idx === selectedIndex
                      ? 'bg-primary-foreground/20'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {node.category.toLowerCase()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
