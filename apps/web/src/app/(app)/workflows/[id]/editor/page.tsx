'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { WorkflowEditor } from '@/components/editor/WorkflowEditor.js';
import type {
  FlowNode,
  FlowEdge,
  WorkflowMeta,
  NodeDefinitionMeta,
} from '@/components/editor/types.js';

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workflow, setWorkflow] = useState<WorkflowMeta | null>(null);
  const [initialNodes, setInitialNodes] = useState<FlowNode[]>([]);
  const [initialEdges, setInitialEdges] = useState<FlowEdge[]>([]);
  const [catalog, setCatalog] = useState<Record<string, NodeDefinitionMeta>>({});
  const [credentials, setCredentials] = useState<Array<{ id: string; name: string; type: string }>>(
    []
  );

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch workflow with graph
        const wfRes = await fetch(`/api/workflows/${workflowId}`);
        if (wfRes.status === 401) {
          router.push('/login');
          return;
        }
        if (!wfRes.ok) {
          throw new Error('Failed to load workflow data');
        }
        const wfData = await wfRes.json();

        // 2. Fetch node catalog
        const catRes = await fetch('/api/nodes/catalog');
        const catData = catRes.ok ? await catRes.json() : { catalog: [] };

        const catalogMap: Record<string, NodeDefinitionMeta> = {};
        for (const item of catData.catalog || []) {
          catalogMap[item.type] = item;
        }

        // 3. Fetch credentials for project
        let credsList: Array<{ id: string; name: string; type: string }> = [];
        if (wfData.workflow?.projectId) {
          const credRes = await fetch(`/api/credentials?projectId=${wfData.workflow.projectId}`);
          if (credRes.ok) {
            const cData = await credRes.json();
            credsList = cData.credentials || [];
          }
        }

        if (!mounted) return;

        setWorkflow(wfData.workflow);
        setCatalog(catalogMap);
        setCredentials(credsList);

        // Map nodes to React Flow format
        const nodes: FlowNode[] = (wfData.nodes || []).map(
          (n: {
            id: string;
            key: string;
            type: string;
            typeVersion?: number;
            name: string;
            positionX?: number;
            positionY?: number;
            config?: Record<string, unknown>;
            credentialId?: string | null;
            settings?: Record<string, unknown>;
          }) => ({
            id: n.id,
            type: 'custom',
            position: { x: n.positionX ?? 100, y: n.positionY ?? 100 },
            data: {
              nodeId: n.id,
              key: n.key,
              type: n.type,
              typeVersion: n.typeVersion ?? 1,
              name: n.name,
              config: n.config ?? {},
              credentialId: n.credentialId ?? null,
              settings: n.settings ?? {},
              status: 'idle',
            },
          })
        );

        // Map connections to React Flow format
        const edges: FlowEdge[] = (wfData.connections || []).map(
          (c: {
            id?: string;
            sourceNodeId: string;
            sourcePort?: string;
            targetNodeId: string;
            targetPort?: string;
          }) => ({
            id:
              c.id ||
              `${c.sourceNodeId}:${c.sourcePort || 'main'}->${c.targetNodeId}:${c.targetPort || 'main'}`,
            source: c.sourceNodeId,
            sourceHandle: c.sourcePort || 'main',
            target: c.targetNodeId,
            targetHandle: c.targetPort || 'main',
            animated: true,
          })
        );

        setInitialNodes(nodes);
        setInitialEdges(edges);
      } catch (err: unknown) {
        if (mounted) setError((err as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadData();

    return () => {
      mounted = false;
    };
  }, [workflowId, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading workflow editor...</p>
        </div>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="rounded-full bg-destructive/10 p-3 text-destructive mb-3">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Failed to load workflow</h2>
          <p className="mt-1 text-xs text-muted-foreground">{error || 'Workflow not found'}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Retry
            </button>
            <Link
              href="/projects"
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Back to Projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WorkflowEditor
      initialWorkflow={workflow}
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      catalog={catalog}
      credentials={credentials}
    >
      <div />
    </WorkflowEditor>
  );
}
