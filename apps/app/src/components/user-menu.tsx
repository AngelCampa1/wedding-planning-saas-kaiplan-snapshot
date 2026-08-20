import { useNavigate } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { queryClient } from "../lib/query-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface User {
  name: string;
  email: string;
}

interface UserMenuProps {
  user: User;
}

function getInitials(name: string): string {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials || "?";
}

export function UserMenu({ user }: UserMenuProps) {
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await authClient.signOut();
      await queryClient.cancelQueries();
    } catch {
      // Ignore sign-out errors — we always clear state and navigate below
    } finally {
      queryClient.clear();
      void navigate({ to: "/login" });
    }
  }

  function handleSettings() {
    void navigate({ to: "/settings" });
  }

  function handleHelp() {
    void navigate({ to: "/help" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/20 transition-colors"
        aria-label="User menu"
      >
        {getInitials(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground truncate">
            {user.name}
          </span>
          <span className="text-xs font-normal text-muted truncate">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleHelp}>Help</DropdownMenuItem>
        <DropdownMenuItem onSelect={handleSettings}>Settings</DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void handleSignOut()}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
