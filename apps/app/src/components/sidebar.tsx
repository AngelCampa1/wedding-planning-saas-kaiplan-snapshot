import { useEffect, useState } from "react";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  CheckSquare,
  Users,
  Store,
  Armchair,
  Globe,
  HelpCircle,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Menu,
} from "lucide-react";
import { Button } from "./ui/button";
import { BrandLogo } from "./brand-logo";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { UserMenu } from "./user-menu";

const STORAGE_KEY = "kaiplan:sidebar-collapsed";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Budget", to: "/budget", icon: Wallet },
  { label: "Checklist", to: "/checklist", icon: CheckSquare },
  { label: "Guests", to: "/guests", icon: Users },
  { label: "Vendors", to: "/vendors", icon: Store },
  { label: "Seating", to: "/seating", icon: Armchair },
  { label: "Website", to: "/website", icon: Globe },
  { label: "Help", to: "/help", icon: HelpCircle },
  { label: "Settings", to: "/settings", icon: Settings },
];

interface SidebarLinksProps {
  label: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

function SidebarLinks({
  label,
  collapsed = false,
  onNavigate,
}: SidebarLinksProps) {
  const matchRoute = useMatchRoute();

  return (
    <nav
      className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3"
      aria-label={label}
    >
      {navItems.map(({ label, to, icon: Icon }) => {
        const isActive = !!matchRoute({ to });
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted hover:bg-foreground/5 hover:text-foreground"
            } ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? label : undefined}
            data-help-key={`${label.toLowerCase()}-nav`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

interface SidebarProps {
  user?: { name: string; email: string };
}

export function Sidebar({ user }: SidebarProps = {}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // ignore storage errors
    }
  }, [collapsed]);

  return (
    <aside
      className={`hidden h-full flex-col border-r border-border bg-background transition-all duration-200 md:flex ${collapsed ? "w-16" : "w-56"}`}
    >
      <div className="flex h-14 items-center border-b border-border px-3 shrink-0">
        {collapsed ? (
          <BrandLogo compact className="h-8 w-8" />
        ) : (
          <BrandLogo className="h-10 w-auto flex-1" />
        )}
        <button
          onClick={() => setCollapsed((current) => !current)}
          className="ml-auto rounded-full p-1.5 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      <SidebarLinks label="Sidebar navigation" collapsed={collapsed} />

      {user && (
        <div className="shrink-0 border-t border-border px-3 py-3 flex justify-center">
          <UserMenu user={user} />
        </div>
      )}
    </aside>
  );
}

export function MobileNavigation() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
        <SheetHeader className="border-b border-border">
          <SheetTitle>
            <BrandLogo className="h-10 w-auto" />
          </SheetTitle>
          <SheetDescription>
            Move between your planning workspace sections.
          </SheetDescription>
        </SheetHeader>
        <SidebarLinks
          label="Mobile navigation"
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
