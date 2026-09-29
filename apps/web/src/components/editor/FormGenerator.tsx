'use client';

import React from 'react';
import { ExpressionInput } from './ExpressionInput.js';
import type { NodeDefinitionMeta } from './types.js';

interface FormGeneratorProps {
  fields: NodeDefinitionMeta['fields'];
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  nodeId: string;
  credentials: Array<{ id: string; name: string; type: string }>;
  credentialId?: string | null;
  onCredentialChange: (credId: string | null) => void;
}

export function FormGenerator({
  fields,
  config,
  onChange,
  nodeId,
  credentials,
  credentialId,
  onCredentialChange,
}: FormGeneratorProps) {
  // Field visibility check based on displayOptions
  const isFieldVisible = (field: NodeDefinitionMeta['fields'][0]) => {
    if (!field.displayOptions) return true;

    if (field.displayOptions.show) {
      for (const [depKey, allowedValues] of Object.entries(field.displayOptions.show)) {
        const currentVal = config[depKey];
        if (!allowedValues.includes(currentVal)) {
          return false;
        }
      }
    }

    if (field.displayOptions.hide) {
      for (const [depKey, disallowedValues] of Object.entries(field.displayOptions.hide)) {
        const currentVal = config[depKey];
        if (disallowedValues.includes(currentVal)) {
          return false;
        }
      }
    }

    return true;
  };

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        if (!isFieldVisible(field)) return null;

        const val = config[field.name] !== undefined ? config[field.name] : field.defaultValue;

        // Credential field
        if (field.type === 'credential') {
          const matchingCreds = field.credentialType
            ? credentials.filter((c) => c.type === field.credentialType)
            : credentials;

          return (
            <div key={field.name} className="space-y-1">
              <label className="block text-xs font-medium text-foreground">
                {field.label} {field.required && <span className="text-destructive">*</span>}
              </label>
              {field.description && (
                <p className="text-[11px] text-muted-foreground">{field.description}</p>
              )}
              <select
                value={credentialId || ''}
                onChange={(e) => onCredentialChange(e.target.value || null)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              >
                <option value="">-- Select Credential --</option>
                {matchingCreds.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>
          );
        }

        // Select field
        if (field.type === 'select') {
          return (
            <div key={field.name} className="space-y-1">
              <label className="block text-xs font-medium text-foreground">
                {field.label} {field.required && <span className="text-destructive">*</span>}
              </label>
              {field.description && (
                <p className="text-[11px] text-muted-foreground">{field.description}</p>
              )}
              <select
                value={String(val ?? '')}
                onChange={(e) => onChange(field.name, e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              >
                {field.options?.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        // Boolean toggle field
        if (field.type === 'boolean') {
          const isChecked = Boolean(val);
          return (
            <div key={field.name} className="flex items-center justify-between py-1">
              <div>
                <label className="text-xs font-medium text-foreground">{field.label}</label>
                {field.description && (
                  <p className="text-[11px] text-muted-foreground">{field.description}</p>
                )}
              </div>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => onChange(field.name, e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
            </div>
          );
        }

        // JSON or textarea field
        if (field.type === 'json' || field.type === 'textarea') {
          return (
            <div key={field.name} className="space-y-1">
              <label className="block text-xs font-medium text-foreground">
                {field.label} {field.required && <span className="text-destructive">*</span>}
              </label>
              {field.description && (
                <p className="text-[11px] text-muted-foreground">{field.description}</p>
              )}
              <ExpressionInput
                type="textarea"
                nodeId={nodeId}
                value={val}
                placeholder={field.type === 'json' ? '{\n  "key": "value"\n}' : ''}
                onChange={(newVal) => onChange(field.name, newVal)}
              />
            </div>
          );
        }

        // Number field
        if (field.type === 'number') {
          return (
            <div key={field.name} className="space-y-1">
              <label className="block text-xs font-medium text-foreground">
                {field.label} {field.required && <span className="text-destructive">*</span>}
              </label>
              {field.description && (
                <p className="text-[11px] text-muted-foreground">{field.description}</p>
              )}
              <input
                type="number"
                value={val !== undefined ? Number(val) : ''}
                onChange={(e) =>
                  onChange(field.name, e.target.value === '' ? undefined : Number(e.target.value))
                }
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              />
            </div>
          );
        }

        // Standard String / Expression field
        return (
          <div key={field.name} className="space-y-1">
            <label className="block text-xs font-medium text-foreground">
              {field.label} {field.required && <span className="text-destructive">*</span>}
            </label>
            {field.description && (
              <p className="text-[11px] text-muted-foreground">{field.description}</p>
            )}
            <ExpressionInput
              nodeId={nodeId}
              value={val}
              onChange={(newVal) => onChange(field.name, newVal)}
            />
          </div>
        );
      })}
    </div>
  );
}
