'use client';

import React, { useState, useMemo } from 'react';
import { Search, Zap, Database, GitBranch, Globe, Bot, Sliders, Plus, X } from 'lucide-react';
import { useEditor } from './EditorContext.js';
import type { NodeDefinitionMeta } from './types.js';

const CATEGORY_ORDER: Array<NodeDefinitionMeta['category']> = [
  'TRIGGERS',
  'DATA',
  'LOGIC',
  'API',
  'AI',
  'DATABASE',
  'FILES',
  'NOTIFICATION',
  'UTILITY',
];

function getCategoryIcon(cat: string) {
  switch (cat) {
    case 'TRIGGERS':
      return <Zap className="h-3.5 w-3.5 text-amber-500" />;
    case 'DATA':
      return <Database className="h-3.5 w-3.5 text-cyan-500" />;
    case 'LOGIC':
      return <GitBranch className="h-3.5 w-3.5 text-orange-500" />;
    case 'API':
      return <Globe className="h-3.5 w-3.5 text-blue-500" />;
    case 'AI':
      return <Bot className="h-3.5 w-3.5 text-purple-500" />;
    case 'NOTIFICATION':
      return <Zap className="h-3.5 w-3.5 text-green-500" />;
    default:
      return <Sliders className="h-3.5 w-3.5 text-slate-400" />;
  }
}

export function NodePalette() {
  const { catalog, isPaletteOpen, setIsPaletteOpen, addNode } = useEditor();
  const [search, setSearch] = useState('');

  const catalogList = useMemo(() => Object.values(catalog), [catalog]);

  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return catalogList;
    const q = search.toLowerCase();
    return catalogList.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q)
    );
  }, [catalogList, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, NodeDefinitionMeta[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const node of filteredCatalog) {
      const list = map.get(node.category) || [];
      list.push(node);
      map.set(node.category, list);
    }
    return map;
  }, [filteredCatalog]);

  if (!isPaletteOpen) return null;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card/80 backdrop-blur text-card-foreground select-none z-10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Nodes Palette
        </div>
        <button
          onClick={() => setIsPaletteOpen(false)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search nodes... (/)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Nodes List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
        {CATEGORY_ORDER.map((cat) => {
          const nodes = grouped.get(cat) || [];
          if (nodes.length === 0) return null;

          return (
            <div key={cat} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                {getCategoryIcon(cat)}
                <span>{cat}</span>
                <span className="text-[10px] opacity-60">({nodes.length})</span>
              </div>

              <div className="space-y-1">
                {nodes.map((node) => (
                  <div
                    key={node.type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/bito-node-type', node.type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => addNode(node.type)}
                    className="group flex cursor-pointer items-start justify-between rounded-lg border border-transparent p-2 text-xs hover:border-border hover:bg-muted/70 transition-all active:scale-[0.98]"
                  >
                    <div className="space-y-0.5 truncate pr-2">
                      <div className="font-medium text-foreground truncate">{node.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate leading-tight">
                        {node.description}
                      </div>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground hover:bg-background transition-opacity"
                      title="Add to canvas"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
