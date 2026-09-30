'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileDrawer } from '@/components/layout/MobileDrawer';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEditor = pathname?.includes('/editor');

  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [userEmail, setUserEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.email) {
          setUserEmail(data.user.email);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      {!sidebarCollapsed && (
        <div className="hidden md:flex md:flex-shrink-0 transition-all duration-200">
          <AppSidebar onToggleCollapse={() => setSidebarCollapsed(true)} />
        </div>
      )}

      {/* Mobile Drawer */}
      <MobileDrawer isOpen={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <AppHeader
          onToggleMobileDrawer={() => setMobileDrawerOpen(true)}
          userEmail={userEmail}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        />
        {isEditor ? (
          <main className="flex-1 min-h-0 w-full overflow-hidden p-0 m-0">
            {children}
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        )}
      </div>
    </div>
  );
}
