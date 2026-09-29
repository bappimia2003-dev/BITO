'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ProjectWorkflowEditorRedirect() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.workflowId as string;

  useEffect(() => {
    if (workflowId) {
      router.replace(`/workflows/${workflowId}/editor`);
    }
  }, [workflowId, router]);

  return null;
}
