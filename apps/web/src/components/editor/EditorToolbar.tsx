'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  RotateCcw,
  RotateCw,
  Check,
  AlertTriangle,
  HelpCircle,
  PanelLeft,
  Save,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useEditor } from './EditorContext.js';

export function EditorToolbar() {
  const {
    workflow,
    saveStatus,
    conflictInfo,
    canUndo,
    canRedo,
    issues,
    isPaletteOpen,
    undo,
    redo,
    validate,
    saveNow,
    resolveConflict,
    setIsRunModalOpen,
    setIsShortcutsOpen,
    setIsPaletteOpen,
    updateWorkflowMeta,
  } = useEditor();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(workflow.name);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  const handleNameSubmit = () => {
    setIsEditingName(false);
    if (nameValue.trim() && nameValue !== workflow.name) {
      updateWorkflowMeta({ name: nameValue.trim() });
    }
  };

  return (
    <header className="flex h-14 w-full items-center justify-between border-b border-border bg-card px-4 text-card-foreground select-none">
      {/* Left section: Back button & Workflow Name & Status */}
      <div className="flex items-center gap-3">
        <Link
          href={`/projects/${workflow.projectId}/workflows`}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Back to workflows"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <button
          onClick={() => setIsPaletteOpen(!isPaletteOpen)}
          className={`rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ${
            isPaletteOpen ? 'bg-muted text-foreground' : ''
          }`}
          title="Toggle Node Palette"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <div className="h-4 w-px bg-border" />

        {/* Workflow Name */}
        {isEditingName ? (
          <input
            autoFocus
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit();
              if (e.key === 'Escape') {
                setNameValue(workflow.name);
                setIsEditingName(false);
              }
            }}
            className="rounded border border-primary bg-background px-2 py-0.5 text-sm font-semibold outline-none"
          />
        ) : (
          <div
            onClick={() => setIsEditingName(true)}
            className="cursor-pointer rounded px-2 py-0.5 text-sm font-semibold hover:bg-muted transition-colors truncate max-w-[200px] md:max-w-xs"
            title="Click to rename"
          >
            {workflow.name}
          </div>
        )}

        {/* Status Badge */}
        <select
          value={workflow.status}
          onChange={(e) =>
            updateWorkflowMeta({ status: e.target.value as 'draft' | 'active' | 'archived' })
          }
          className={`rounded-full px-2 py-0.5 text-xs font-medium outline-none border cursor-pointer ${
            workflow.status === 'active'
              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
              : workflow.status === 'draft'
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                : 'bg-muted text-muted-foreground border-border'
          }`}
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>

        {/* Revision badge */}
        <span className="font-mono text-[11px] text-muted-foreground">r{workflow.revision}</span>
      </div>

      {/* Center: Save state indicator & Conflict resolution */}
      <div className="flex items-center gap-2 text-xs">
        {saveStatus === 'saving' && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Saving...</span>
          </div>
        )}
        {saveStatus === 'saved' && (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            <span>Saved</span>
          </div>
        )}
        {saveStatus === 'conflict' && conflictInfo && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/15 px-2 py-1 text-destructive font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Revision conflict!</span>
            <button
              onClick={() => resolveConflict('reload')}
              className="underline text-[11px] hover:opacity-80"
            >
              Reload
            </button>
            <span>/</span>
            <button
              onClick={() => resolveConflict('overwrite')}
              className="underline text-[11px] hover:opacity-80"
            >
              Overwrite
            </button>
          </div>
        )}
        {saveStatus === 'error' && (
          <div className="flex items-center gap-1.5 text-destructive font-medium">
            <span>Save error</span>
            <button onClick={() => saveNow()} className="underline text-[11px]">
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Right section: Undo/Redo, Validate, Run, Shortcuts */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors"
          title="Redo (Ctrl+Y)"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        <div className="h-4 w-px bg-border" />

        {/* Validate button */}
        <button
          onClick={validate}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
          title="Validate workflow graph"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          <span>Validate</span>
          {(errorCount > 0 || warningCount > 0) && (
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                errorCount > 0
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {errorCount || warningCount}
            </span>
          )}
        </button>

        {/* Manual Save */}
        <button
          onClick={() => saveNow()}
          disabled={saveStatus === 'saving'}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors"
          title="Save now (Ctrl+S)"
        >
          <Save className="h-4 w-4" />
        </button>

        {/* Run button */}
        <button
          onClick={() => setIsRunModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 transition-opacity"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Run</span>
        </button>

        <div className="h-4 w-px bg-border" />

        {/* Keyboard Shortcuts */}
        <button
          onClick={() => setIsShortcutsOpen(true)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
