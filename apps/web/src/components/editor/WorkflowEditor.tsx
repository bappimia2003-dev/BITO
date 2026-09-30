'use client';

import React from 'react';
import { EditorProvider, type EditorProviderProps } from './EditorContext.js';
import { EditorToolbar } from './EditorToolbar.js';
import { EditorCanvas } from './EditorCanvas.js';
import { ExecutionLogsPanel } from './ExecutionLogsPanel.js';

export function WorkflowEditor(props: EditorProviderProps) {
  return (
    <EditorProvider {...props}>
      <div className="flex flex-col h-full w-full overflow-hidden bg-background">
        <EditorToolbar />
        <EditorCanvas />
        <ExecutionLogsPanel />
      </div>
    </EditorProvider>
  );
}
