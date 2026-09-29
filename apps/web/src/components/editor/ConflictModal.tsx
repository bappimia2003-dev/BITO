'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, UploadCloud } from 'lucide-react';
import { useEditor } from './EditorContext.js';

export function ConflictModal() {
  const { conflictInfo, resolveConflict } = useEditor();

  if (!conflictInfo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
        <div className="flex items-center gap-3 text-destructive">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Revision Conflict Detected</h3>
            <p className="text-xs text-muted-foreground">HTTP 409 Conflict</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
          This workflow has been modified in another session (current server revision is{' '}
          <span className="font-mono font-bold text-foreground">
            r{conflictInfo.serverRevision}
          </span>
          ). To prevent accidentally overwriting other changes, choose how you would like to
          proceed:
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={() => resolveConflict('reload')}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reload Latest (Discard Local Changes)</span>
          </button>

          <button
            onClick={() => resolveConflict('overwrite')}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Overwrite Server (Keep Local Changes)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
