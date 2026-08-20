import { useNavigate } from "@tanstack/react-router";
import { Armchair, Globe, UserPlus } from "lucide-react";
import { Button } from "../ui/button";

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-wrap gap-3"
      data-help-key="dashboard-quick-actions"
      data-tour="dashboard-quick-actions"
    >
      <Button
        variant="outline"
        onClick={() => void navigate({ to: "/guests" })}
      >
        <UserPlus className="mr-2 h-4 w-4" />
        Add Guest
      </Button>
      <Button
        variant="outline"
        onClick={() => void navigate({ to: "/website" })}
      >
        <Globe className="mr-2 h-4 w-4" />
        Edit Website
      </Button>
      <Button
        variant="outline"
        onClick={() => void navigate({ to: "/seating" })}
      >
        <Armchair className="mr-2 h-4 w-4" />
        Go to Seating
      </Button>
    </div>
  );
}
