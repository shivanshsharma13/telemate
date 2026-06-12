import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useGetAuthStatus, useLogout, getGetAuthStatusQueryKey } from "@workspace/api-client-react";
import { FolderGit2, HardDrive, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DownloadsPanel } from "./downloads-panel";
import { useQueryClient } from "@tanstack/react-query";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: authStatus } = useGetAuthStatus();
  const logout = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
        setLocation("/");
      }
    });
  };

  if (!authStatus?.authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
          <HardDrive className="h-5 w-5 text-primary mr-2" />
          <span className="font-semibold tracking-tight text-card-foreground">Telegram Explorer</span>
        </div>
        
        <div className="flex-1 py-4 flex flex-col gap-1 px-2">
          <Link href="/channels" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === '/channels' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
            <FolderGit2 className="h-4 w-4" />
            Channels
          </Link>
          
          <DownloadsPanel triggerClassName={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full justify-start`} />
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
              {authStatus.first_name?.[0] || authStatus.username?.[0] || "?"}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{authStatus.first_name || authStatus.username}</span>
              <span className="text-xs text-muted-foreground truncate">{authStatus.phone}</span>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-muted-foreground" size="sm" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {children}
      </main>
    </div>
  );
}
