'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderKanban,
  Workflow as WorkflowIcon,
  Activity,
  KeyRound,
  FileSpreadsheet,
  Variable,
  Settings,
  Shield,
  PanelLeftClose,
} from 'lucide-react';

interface AppSidebarProps {
  onCloseMobile?: () => void;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ onCloseMobile, onToggleCollapse }: AppSidebarProps) {
  const pathname = usePathname();

  // Extract projectId if inside /projects/[id]
  const projectMatch = pathname?.match(/\/projects\/([0-9a-fA-F-]+)/);
  const projectId = projectMatch ? projectMatch[1] : null;

  const projectLinks = projectId
    ? [
        {
          label: 'Workflows',
          href: `/projects/${projectId}/workflows`,
          icon: WorkflowIcon,
        },
        {
          label: 'Executions',
          href: `/projects/${projectId}/executions`,
          icon: Activity,
        },
        {
          label: 'Credentials',
          href: `/projects/${projectId}/credentials`,
          icon: KeyRound,
        },
        {
          label: 'Files & Data',
          href: `/projects/${projectId}/files`,
          icon: FileSpreadsheet,
        },
        {
          label: 'Variables',
          href: `/projects/${projectId}/variables`,
          icon: Variable,
        },
        {
          label: 'Project Settings',
          href: `/projects/${projectId}/settings`,
          icon: Settings,
        },
      ]
    : [];

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-card text-card-foreground select-none">
      {/* Brand Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs shadow">
            B
          </div>
          <Link
            href="/projects"
            onClick={onCloseMobile}
            className="flex items-center gap-1 font-semibold text-sm tracking-tight hover:opacity-80 truncate"
          >
            <span className="text-foreground">BITO</span>
            <span className="text-xs text-muted-foreground font-normal">Platform</span>
          </Link>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
            title="Hide workspace sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {/* Global Links */}
        <div>
          <div className="px-2 mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Workspace
          </div>
          <nav className="space-y-1">
            <Link
              href="/projects"
              onClick={onCloseMobile}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                pathname === '/projects'
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <FolderKanban className="h-4 w-4 shrink-0" />
              <span className="truncate">All Projects</span>
            </Link>
          </nav>
        </div>

        {/* Project Links (when in project context) */}
        {projectId && (
          <div>
            <div className="px-2 mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Project
            </div>
            <nav className="space-y-1">
              {projectLinks.map((link) => {
                const isActive = pathname?.startsWith(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onCloseMobile}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* Bottom Footer: Account & Security */}
      <div className="border-t border-border p-2.5 space-y-1">
        <Link
          href="/settings/security"
          onClick={onCloseMobile}
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
            pathname?.startsWith('/settings/security')
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          <Shield className="h-4 w-4 shrink-0" />
          <span className="truncate">Security & Passkeys</span>
        </Link>
      </div>
    </aside>
  );
}
