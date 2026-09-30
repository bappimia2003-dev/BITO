'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, LogOut, ChevronRight, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle.js';

interface AppHeaderProps {
  onToggleMobileDrawer: () => void;
  userEmail?: string | null;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function AppHeader({
  onToggleMobileDrawer,
  userEmail,
  sidebarCollapsed,
  onToggleSidebar,
}: AppHeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  return (
    <header className="shrink-0 flex h-14 w-full items-center justify-between border-b border-border bg-card px-4 z-30 select-none">
      {/* Left: Mobile Toggle, Desktop Sidebar Toggle & Brand/Breadcrumbs */}
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title={sidebarCollapsed ? 'Expand workspace sidebar' : 'Hide workspace sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleMobileDrawer}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border md:hidden text-foreground hover:bg-accent"
          aria-label="Open mobile menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center text-sm font-medium">
          <Link
            href="/projects"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            BITO
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
          <span className="text-foreground font-semibold">Console</span>
        </nav>
      </div>

      {/* Right: Theme Toggle & User Info / Logout */}
      <div className="flex items-center gap-2">
        <ThemeToggle />

        {userEmail && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1.5 border border-border">
            <User className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono truncate max-w-[160px]">{userEmail}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{loggingOut ? 'Signing out...' : 'Sign out'}</span>
        </button>
      </div>
    </header>
  );
}
