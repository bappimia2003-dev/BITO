'use client';

import React from 'react';
import { X, Command } from 'lucide-react';
import { useEditor } from './EditorContext.js';

const SHORTCUTS = [
  { keys: ['Ctrl', 'Z'], desc: 'Undo last change' },
  { keys: ['Ctrl', 'Y'], desc: 'Redo last change' },
  { keys: ['Ctrl', 'S'], desc: 'Save workflow immediately' },
  { keys: ['/'], desc: 'Quick-add node palette' },
  { keys: ['Ctrl', 'K'], desc: 'Command palette / Quick-add' },
  { keys: ['Delete'], desc: 'Delete selected node' },
  { keys: ['Esc'], desc: 'Deselect node / close modal' },
  { keys: ['Space', '+ Drag'], desc: 'Pan canvas' },
  { keys: ['Scroll'], desc: 'Zoom in / out' },
];

export function ShortcutsModal() {
  const { isShortcutsOpen, setIsShortcutsOpen } = useEditor();

  if (!isShortcutsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={() => setIsShortcutsOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Command className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={() => setIsShortcutsOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 divide-y divide-border/50 text-xs">
          {SHORTCUTS.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, kidx) => (
                  <kbd
                    key={kidx}
                    className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground shadow-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
