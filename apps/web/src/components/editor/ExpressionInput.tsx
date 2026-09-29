'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Brackets, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useEditor } from './EditorContext.js';

interface ExpressionInputProps {
  value: unknown;
  onChange: (val: unknown) => void;
  nodeId?: string;
  placeholder?: string;
  type?: 'string' | 'textarea' | 'number';
}

const AUTOCOMPLETE_PREFIXES = [
  { label: 'input.', hint: 'Current item fields' },
  { label: 'trigger.', hint: 'Trigger payload fields' },
  { label: 'nodes.', hint: 'Upstream node outputs' },
  { label: 'vars.', hint: 'Workflow/project variables' },
];

export function ExpressionInput({
  value,
  onChange,
  nodeId,
  placeholder,
  type = 'string',
}: ExpressionInputProps) {
  const { workflow, nodes } = useEditor();
  const strValue =
    typeof value === 'string'
      ? value
      : value !== undefined && value !== null
        ? JSON.stringify(value)
        : '';
  const isExpression = strValue.includes('{{');

  const [previewResult, setPreviewResult] = useState<unknown>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const previewTimer = useRef<NodeJS.Timeout | null>(null);

  // Debounced live preview evaluation
  useEffect(() => {
    if (!isExpression || !strValue.trim()) {
      setPreviewResult(null);
      setPreviewError(null);
      return;
    }

    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/workflows/${workflow.id}/expressions/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expression: strValue,
            nodeId,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setPreviewResult(data.result);
          setPreviewError(null);
        } else {
          setPreviewResult(null);
          setPreviewError(data.error);
        }
      } catch (err: unknown) {
        setPreviewError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [strValue, isExpression, workflow.id, nodeId]);

  const toggleExpressionMode = () => {
    if (isExpression) {
      // Strip {{ and }}
      const cleaned = strValue.replace(/\{\{\s*|\s*\}\}/g, '');
      onChange(cleaned);
    } else {
      onChange(`{{ ${strValue || 'input.value'} }}`);
    }
  };

  const handleInsertPrefix = (prefix: string) => {
    if (!strValue.includes('{{')) {
      onChange(`{{ ${prefix} }}`);
    } else {
      onChange(`${strValue} ${prefix}`);
    }
  };

  return (
    <div className="space-y-1 text-xs">
      <div className="relative flex items-center">
        {type === 'textarea' ? (
          <textarea
            rows={3}
            value={strValue}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full rounded-md border bg-background p-2 pr-8 text-xs font-mono outline-none focus:border-primary ${
              isExpression ? 'border-primary/60 bg-primary/5' : 'border-border'
            }`}
          />
        ) : (
          <input
            type="text"
            value={strValue}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full rounded-md border bg-background px-2.5 py-1.5 pr-8 text-xs font-mono outline-none focus:border-primary ${
              isExpression ? 'border-primary/60 bg-primary/5' : 'border-border'
            }`}
          />
        )}

        <button
          type="button"
          onClick={toggleExpressionMode}
          className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded transition-colors ${
            isExpression
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
          title="Toggle expression {{ }}"
        >
          <Brackets className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Autocomplete helper chips */}
      {isExpression && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Sparkles className="h-2.5 w-2.5" /> Insert:
          </span>
          {AUTOCOMPLETE_PREFIXES.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handleInsertPrefix(p.label)}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            >
              {p.label}
            </button>
          ))}
          {nodes
            .filter((n) => n.id !== nodeId)
            .map((n) => (
              <button
                key={n.data.key}
                type="button"
                onClick={() => handleInsertPrefix(`nodes.${n.data.key}.json.`)}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                title={`Output of ${n.data.name}`}
              >
                {n.data.key}
              </button>
            ))}
        </div>
      )}

      {/* Live Preview output badge */}
      {isExpression && (
        <div className="rounded border border-border/60 bg-muted/30 px-2 py-1 text-[11px]">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Live Preview:</span>
            {isLoading && <span className="animate-pulse">evaluating...</span>}
          </div>
          {previewError ? (
            <div className="mt-0.5 flex items-start gap-1 text-destructive font-mono text-[10px]">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="truncate">{previewError}</span>
            </div>
          ) : previewResult !== null && previewResult !== undefined ? (
            <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {typeof previewResult === 'object'
                  ? JSON.stringify(previewResult)
                  : String(previewResult)}
              </span>
            </div>
          ) : (
            <div className="mt-0.5 text-[10px] text-muted-foreground italic">No preview data</div>
          )}
        </div>
      )}
    </div>
  );
}
