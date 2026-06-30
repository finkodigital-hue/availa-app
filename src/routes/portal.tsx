import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarCheck, LogOut, User as UserIcon, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/portal")({
  ssr: false,
  component: PortalLayout,
});

function PortalLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/portal", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/portal" className="flex items-center gap-2 font-display text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            My bookings
          </Link>
          {user ? (
            <nav className="flex items-center gap-1">
              <Link
                to="/portal/bookings"
                className={`text-sm px-3 h-9 rounded-md inline-flex items-center gap-1.5 transition ${path.startsWith("/portal/bookings") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <CalendarCheck className="h-4 w-4" /> Bookings
              </Link>
              <Link
                to="/portal/profile"
                className={`text-sm px-3 h-9 rounded-md inline-flex items-center gap-1.5 transition ${path.startsWith("/portal/profile") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <UserIcon className="h-4 w-4" /> Profile
              </Link>
              <Button variant="ghost" size="sm" onClick={signOut} className="ml-2 text-muted-foreground">
                <LogOut className="h-4 w-4 mr-1.5" /> Sign out
              </Button>
            </nav>
          ) : null}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
        <Outlet />
      </main>
    </div>
  );
}
