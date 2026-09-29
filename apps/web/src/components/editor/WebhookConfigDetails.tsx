'use client';

import React, { useEffect, useState } from 'react';
import { Copy, Check, RefreshCw, Terminal, AlertCircle } from 'lucide-react';
import type { FlowNode } from './types.js';

interface WebhookConfigDetailsProps {
  workflowId: string;
  node: FlowNode;
}

interface WebhookEndpointData {
  id: string;
  token: string;
  secret?: string | null;
  config: Record<string, unknown>;
  isActive: boolean;
}

export function WebhookConfigDetails({ workflowId, node }: WebhookConfigDetailsProps) {
  const [endpoint, setEndpoint] = useState<WebhookEndpointData | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const loadEndpoint = async () => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}/webhooks`);
      if (!res.ok) return;
      const data = await res.json();
      const match = (data.webhooks as WebhookEndpointData[]).find(
        (w: WebhookEndpointData & { nodeId?: string }) => w.nodeId === node.id
      );
      if (match) {
        setEndpoint(match);
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    void loadEndpoint();
  }, [workflowId, node.id]);

  const handleRotate = async () => {
    if (!endpoint) return;
    if (
      !confirm('Are you sure you want to rotate this webhook secret? Existing callers will fail.')
    ) {
      return;
    }
    setIsRotating(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/webhooks/${endpoint.id}/rotate`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setEndpoint((prev) => (prev ? { ...prev, token: data.token, secret: data.secret } : null));
      }
    } catch {
      // Ignored
    } finally {
      setIsRotating(false);
    }
  };

  if (!endpoint) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          <span>Webhook Endpoint Inactive</span>
        </div>
        Activate the workflow to generate your live webhook URL and HMAC secret.
      </div>
    );
  }

  const webhookUrl = `${origin}/api/hooks/${endpoint.token}`;
  const secret = endpoint.secret || '<YOUR_SECRET>';

  const curlExample = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Bito-Timestamp: $(date +%s)" \\
  -H "X-Bito-Signature: sha256=$(echo -n "$(date +%s).{\\"sample\\":\\"data\\"}" | openssl dgst -sha256 -hmac "${secret}" | sed 's/^.* //')" \\
  -d '{"sample":"data"}'`;

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
      {/* URL */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-foreground">Webhook URL</label>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(webhookUrl);
              setCopiedUrl(true);
              setTimeout(() => setCopiedUrl(false), 2000);
            }}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            {copiedUrl ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
          </button>
        </div>
        <div className="rounded border border-border bg-background p-1.5 font-mono text-[11px] break-all select-all">
          {webhookUrl}
        </div>
      </div>

      {/* Secret & Rotation */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-foreground">HMAC Secret</label>
          <button
            onClick={handleRotate}
            disabled={isRotating}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 ${isRotating ? 'animate-spin' : ''}`} />
            <span>Rotate Secret</span>
          </button>
        </div>
        <div className="rounded border border-border bg-background p-1.5 font-mono text-[11px] text-muted-foreground break-all select-all">
          {endpoint.secret || '••••••••••••••••••••••••••••••••'}
        </div>
      </div>

      {/* cURL Example */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Terminal className="h-3 w-3" />
            <span>cURL Example</span>
          </span>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(curlExample);
              setCopiedCurl(true);
              setTimeout(() => setCopiedCurl(false), 2000);
            }}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            {copiedCurl ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{copiedCurl ? 'Copied' : 'Copy cURL'}</span>
          </button>
        </div>
        <pre className="rounded border border-border bg-background p-2 font-mono text-[10px] text-muted-foreground overflow-x-auto whitespace-pre">
          {curlExample}
        </pre>
      </div>
    </div>
  );
}
