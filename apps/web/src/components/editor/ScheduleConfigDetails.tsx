'use client';

import React, { useEffect, useState } from 'react';
import { Calendar, Clock, AlertTriangle } from 'lucide-react';

interface ScheduleConfigDetailsProps {
  workflowId: string;
  cron: string;
  timezone: string;
}

export function ScheduleConfigDetails({ workflowId, cron, timezone }: ScheduleConfigDetailsProps) {
  const [occurrences, setOccurrences] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchPreview = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/workflows/${workflowId}/schedules/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cron, timezone: timezone || 'UTC', count: 5 }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (active) setError(data.error?.message || 'Invalid schedule configuration');
          return;
        }
        const data = await res.json();
        if (active) setOccurrences(data.occurrences || []);
      } catch {
        if (active) setError('Failed to load schedule preview');
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      void fetchPreview();
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workflowId, cron, timezone]);

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-foreground">
        <Calendar className="h-3.5 w-3.5 text-primary" />
        <span>Next 5 Scheduled Runs</span>
      </div>

      {error ? (
        <div className="flex items-center gap-1.5 text-destructive text-[11px] pt-1">
          <AlertTriangle className="h-3 w-3" />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="py-2 text-[11px] text-muted-foreground animate-pulse">
          Calculating next runs...
        </div>
      ) : occurrences.length > 0 ? (
        <div className="space-y-1.5 pt-1">
          {occurrences.map((occ, idx) => {
            const date = new Date(occ);
            return (
              <div
                key={occ}
                className="flex items-center justify-between rounded border border-border/60 bg-background px-2 py-1 text-[11px]"
              >
                <span className="font-medium text-foreground">#{idx + 1}</span>
                <span className="flex items-center gap-1 font-mono text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {date.toLocaleString(undefined, { timeZone: timezone || 'UTC' })}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-2 text-[11px] text-muted-foreground">
          Enter a valid cron expression to preview upcoming runs.
        </div>
      )}
    </div>
  );
}
