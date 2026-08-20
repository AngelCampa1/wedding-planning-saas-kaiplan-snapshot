import type { ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

interface HelpTooltipProps {
  children: ReactElement;
  content?: string | null;
}

export function HelpTooltip({ children, content }: HelpTooltipProps) {
  if (!content) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent sideOffset={6}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
