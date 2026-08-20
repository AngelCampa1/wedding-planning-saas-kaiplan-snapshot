import { ChevronDown } from "lucide-react";
import type { WeddingWithRole } from "@kaiplan/shared";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface WeddingPickerProps {
  weddings: WeddingWithRole[];
  activeWeddingId: string;
  onSelect: (id: string) => void;
}

export function WeddingPicker({
  weddings,
  activeWeddingId,
  onSelect,
}: WeddingPickerProps) {
  const activeWedding = weddings.find(
    (wedding) => wedding.id === activeWeddingId,
  );
  const activeWeddingName =
    activeWedding?.name ?? weddings[0]?.name ?? "No wedding yet";

  if (weddings.length <= 1) {
    return (
      <span className="block max-w-[14rem] truncate text-sm font-medium text-foreground sm:max-w-xs">
        {activeWeddingName}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex min-w-0 max-w-[14rem] items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary sm:max-w-xs"
          aria-label="Select wedding"
        >
          <span className="truncate">{activeWeddingName}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {weddings.map((wedding) => {
          const isActive = wedding.id === activeWeddingId;

          return (
            <DropdownMenuItem
              key={wedding.id}
              onSelect={() => onSelect(wedding.id)}
              className={isActive ? "bg-primary/5 text-primary" : undefined}
            >
              <div className="flex min-w-0 w-full items-center justify-between gap-2">
                <span className="truncate">{wedding.name}</span>
                <Badge
                  variant={isActive ? "default" : "neutral"}
                  className="shrink-0 capitalize"
                >
                  {wedding.role}
                </Badge>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
