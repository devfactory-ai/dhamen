import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '@/stores/ui';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { sidebarOpen, sidebarCollapsed, setSidebarOpen } = useUIStore();

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar (fixed) */}
      <Sidebar />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setSidebarOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Fermer le menu"
        />
      )}

      {/* Main content - offset by sidebar width */}
      <div
        className="flex flex-col min-h-screen transition-all duration-300"
        style={{ marginLeft: `var(--sidebar-width)` }}
      >
        <Header />
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">{children}</main>
      </div>

      {/* CSS variable for sidebar width */}
      <style>{`
        :root {
          --sidebar-width: ${sidebarCollapsed ? '68px' : '288px'};
        }
        @media (max-width: 1023px) {
          :root {
            --sidebar-width: 0px;
          }
        }
      `}</style>
    </div>
  );
}
